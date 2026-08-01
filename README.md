# Autopilot Finance Site

A free, self-updating finance site: aggregated headlines + original
AI-written articles + live stock charts + calculators. Hosted for free on
GitHub Pages, updated automatically by GitHub Actions.

## What's included

- **Aggregator**: pulls headlines from RSS feeds you choose, links out to
  the original source (`_data/aggregator.yml`, shown on the homepage).
- **Own articles**: for a few new stories per run, Claude writes an
  original article (not a copy) with a free stock photo, saved in `_posts/`.
- **Live charts**: `/quote/?symbol=AAPL` embeds a free TradingView widget —
  works for any ticker, no API key needed.
- **Calculators**: `/calculators/` — mortgage calculator (pure JS) and
  currency converter (free API, no key needed).
- **SEO**: meta tags, Open Graph, Twitter Cards, and `sitemap.xml` are all
  handled automatically by the `jekyll-seo-tag` and `jekyll-sitemap`
  plugins — both are pre-installed on GitHub Pages, nothing to configure
  beyond filling in `_config.yml`.
- **AdSense-ready**: ad slots are already placed in the layouts; they stay
  invisible until you add your publisher ID.
- **Affiliate-ready**: a disclosure banner is already wired into every
  article; add your affiliate links directly in article content once you
  join a program.

## Setup steps

### 1. Edit `_config.yml`
Fill in `title`, `description`, `url`, and your Twitter handle. This
directly feeds your SEO meta tags and social previews.

### 2. Create the GitHub repository and enable Pages
- Upload all files, keeping the folder structure.
- **Settings → Pages** → Source: `Deploy from a branch` → `main` / `(root)`.

### 3. Add secrets (Settings → Secrets and variables → Actions)
| Name | Where to get it | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | Yes — powers the AI-written articles |
| `PEXELS_API_KEY` | pexels.com/api (free, no card needed) | Optional — skip and articles publish without images |

### 4. Add a repository variable
- **Settings → Secrets and variables → Actions → Variables tab**
- Name: `RSS_FEEDS`
- Value: comma-separated list of finance RSS feed URLs you want to pull
  from. The script ships with two defaults, but **verify they're still
  live and pick sources you actually want** — RSS URLs change over time.

### 5. Test it
- **Actions tab → "Auto-generate finance content" → Run workflow**
- Check `_posts/` for a new article and `_data/aggregator.yml` for new
  headline entries.

## Turning on monetization later

### Google AdSense
1. Apply at adsense.google.com once your site has some real content and
   traffic — Google reviews the site manually.
2. **Important**: AdSense (and Google Search generally) penalizes sites
   built mainly from mass-produced, unedited AI content — this is an
   active policy called "scaled content abuse." To stay safe:
   - Keep the number of auto-published articles per day low (the default
     here is 1 every 6 hours — intentionally conservative).
   - Periodically read and lightly edit/fact-check what gets published,
     especially anything with numbers or specific claims.
   - Treat the aggregator + AI drafts as a *starting point*, not the whole
     strategy — original human commentary is what actually earns approval
     and rankings long-term.
3. Once approved, put your `ca-pub-XXXXXXXXXXXXXXXX` ID into
   `adsense_client` in `_config.yml`, and replace the `ads.txt` content
   with the exact line AdSense gives you.

### Affiliate programs
- Most affiliate networks (Amazon Associates, financial-product
  affiliates, etc.) also want to see an established site with real
  content before approving you — same order of operations as AdSense.
- The disclosure banner (`_includes/affiliate-disclosure.html`) is
  already shown on every article — required by FTC guidelines in the US.
  Update the wording in `_config.yml` (`affiliate_disclosure`) if needed.
- Add affiliate links directly inside article Markdown once approved.

## Notes

- **Cost**: GitHub Pages + Actions are free for public repos. Only real
  cost is Claude API usage for article text — a few cents per article at
  most, and you control the frequency in the workflow's cron schedule.
- **Live prices in the ticker strip on the homepage** (like Yahoo's) would
  need a market-data API (e.g. Twelve Data, Finnhub) — not included yet,
  since it adds another API key / rate-limit to manage. Happy to add it
  once the rest is running and you're comfortable with the setup.
