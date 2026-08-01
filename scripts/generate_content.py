#!/usr/bin/env python3
"""
Combined content pipeline for the finance site:

1. Pulls headlines from several finance RSS feeds.
2. Writes ALL of them into _data/aggregator.yml (headline + link out to the
   original source) -> this is the "aggregator" part of the site.
3. Picks a small number of NEW items and asks Claude to write a fully
   original article about the underlying story, with a free stock photo
   from Pexels -> this is the "own articles" part of the site.

Run inside GitHub Actions on a schedule. Git commit/push is handled by the
workflow, not by this script.
"""

import os
import re
import json
import hashlib
import datetime
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

# ----- Configuration -----
FEEDS = [f.strip() for f in os.environ.get(
    "RSS_FEEDS",
    "https://feeds.content.dowjones.io/public/rss/mw_topstories,"
    "https://www.investing.com/rss/news.rss"
).split(",") if f.strip()]

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
PEXELS_API_KEY = os.environ.get("PEXELS_API_KEY", "")  # optional - skip images if not set

POSTS_DIR = os.environ.get("POSTS_DIR", "_posts")
AGGREGATOR_FILE = os.environ.get("AGGREGATOR_FILE", "_data/aggregator.yml")
SEEN_FILE = os.environ.get("SEEN_FILE", "scripts/seen_items.json")
MAX_ARTICLES_PER_RUN = int(os.environ.get("MAX_ARTICLES_PER_RUN", "1"))
MAX_AGGREGATOR_ITEMS = int(os.environ.get("MAX_AGGREGATOR_ITEMS", "60"))

SYSTEM_PROMPT = """You are a financial journalist writing for an online finance and markets site.
Based on the given news headline and short description, write a fully ORIGINAL article
in English. Do not copy or closely paraphrase the source text - write your own independent
take, adding context or background a reader would find useful. Do not invent specific
numbers, quotes, or figures that were not given to you.

Respond ONLY with a JSON object, no text before or after, no markdown code fences:

{
  "title": "article title in English",
  "content": "article body in Markdown format, 400-600 words",
  "excerpt": "short summary, 1-2 sentences",
  "tags": ["tag1", "tag2", "tag3"],
  "image_query": "2-4 word English search phrase for a relevant stock photo, e.g. 'stock market trading floor'"
}
"""


def fetch_rss_items(feed_url):
    req = urllib.request.Request(feed_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
    root = ET.fromstring(raw)
    items = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = (item.findtext("description") or "").strip()
        description = re.sub("<[^<]+?>", "", description)
        pubdate = (item.findtext("pubDate") or "").strip()
        if title and link:
            items.append({
                "title": title, "link": link,
                "description": description, "pubdate": pubdate,
                "source": urllib.parse.urlparse(feed_url).netloc,
            })
    return items


def load_seen(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_seen(path, seen_set):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sorted(seen_set), f, indent=2)


def item_hash(item):
    return hashlib.sha256(item["link"].encode("utf-8")).hexdigest()[:16]


def update_aggregator(all_items):
    """Overwrite _data/aggregator.yml with the newest N unique items, newest first."""
    seen_links = set()
    deduped = []
    for item in all_items:
        if item["link"] in seen_links:
            continue
        seen_links.add(item["link"])
        deduped.append(item)

    deduped = deduped[:MAX_AGGREGATOR_ITEMS]

    os.makedirs(os.path.dirname(AGGREGATOR_FILE), exist_ok=True)
    with open(AGGREGATOR_FILE, "w", encoding="utf-8") as f:
        for item in deduped:
            f.write(f"- title: {json.dumps(item['title'])}\n")
            f.write(f"  link: {json.dumps(item['link'])}\n")
            f.write(f"  source: {json.dumps(item['source'])}\n")
            f.write(f"  pubdate: {json.dumps(item['pubdate'])}\n")
    print(f"Wrote {len(deduped)} items to {AGGREGATOR_FILE}")


def call_claude(item):
    user_message = f"Headline: {item['title']}\nDescription: {item['description']}"
    payload = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 1500,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())

    text = "".join(
        b.get("text", "") for b in result.get("content", []) if b.get("type") == "text"
    ).strip()
    text = re.sub(r"^```(json)?", "", text.strip())
    text = re.sub(r"```$", "", text.strip())
    return json.loads(text)


def fetch_pexels_image(query):
    if not PEXELS_API_KEY:
        return None, None
    url = "https://api.pexels.com/v1/search?" + urllib.parse.urlencode({"query": query, "per_page": 1})
    req = urllib.request.Request(url, headers={"Authorization": PEXELS_API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
        photo = data["photos"][0]
        return photo["src"]["large"], f'Photo by {photo["photographer"]} on Pexels'
    except Exception as e:
        print(f"Pexels lookup failed for '{query}': {e}")
        return None, None


def slugify(title):
    slug = title.lower()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug).strip("-")
    return slug[:60]


def write_post(article, source_link):
    today = datetime.date.today().isoformat()
    slug = slugify(article["title"])
    path = os.path.join(POSTS_DIR, f"{today}-{slug}.md")

    image_url, image_credit = fetch_pexels_image(article.get("image_query", "finance"))

    front = {
        "layout": "post",
        "title": article["title"],
        "date": f"{today} 08:00:00 +0000",
        "excerpt": article["excerpt"],
        "tags": article.get("tags", []),
        "source": source_link,
    }
    if image_url:
        front["image"] = image_url
        front["image_credit"] = image_credit

    os.makedirs(POSTS_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("---\n")
        for k, v in front.items():
            if isinstance(v, list):
                f.write(f"{k}: [{', '.join(v)}]\n")
            else:
                f.write(f'{k}: "{v}"\n')
        f.write("---\n\n")
        f.write(article["content"])
        f.write("\n")
    print(f"Wrote {path}")


def main():
    all_items = []
    for feed_url in FEEDS:
        try:
            all_items.extend(fetch_rss_items(feed_url))
        except Exception as e:
            print(f"Failed to fetch {feed_url}: {e}")

    # Part B: aggregator - store everything we found
    update_aggregator(all_items)

    # Part A: own articles - generate for a few new items
    seen = load_seen(SEEN_FILE)
    new_count = 0
    for item in all_items:
        if new_count >= MAX_ARTICLES_PER_RUN:
            break
        h = item_hash(item)
        if h in seen:
            continue
        print(f"Generating article for: {item['title']}")
        try:
            article = call_claude(item)
            write_post(article, item["link"])
            seen.add(h)
            new_count += 1
        except Exception as e:
            print(f"Failed to process '{item['title']}': {e}")

    save_seen(SEEN_FILE, seen)
    print(f"Done. {new_count} new article(s) written.")


if __name__ == "__main__":
    main()
