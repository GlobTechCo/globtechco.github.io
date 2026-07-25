# Fintorra — setup checklist after deploying to GitHub Pages

A few things need to be set up once for the site to be fully live.
Nothing else here requires action — everything else deploys automatically.

## 1. Market news (most important — currently not showing anything)

Headlines come from a GitHub Actions workflow that runs every 2 hours
and writes `data/news.json`, since GitHub Pages can't run a server.

**One-time setup required — the workflow does nothing until you do this:**
1. In this repo on GitHub, use **Add file → Create new file** and create
   these two files (copy their content from this project's
   `.github/workflows/update-news.yml` and `.github/scripts/fetch-news.js`
   — type the full path including `.github/...` in the filename box so
   GitHub creates the folders for you).
2. Go to the **Actions** tab. "Update financial news" should now appear
   in the list on the left.
3. Click it → **Run workflow** → wait about a minute.
4. Check the result: a green checkmark means it worked and
   `data/news.json` now has real headlines. A red X means something
   failed — open that run and expand "Fetch news and write
   data/news.json"; each news source logs its own status, so the log
   will say exactly which one failed and why.
5. Until step 3 succeeds at least once, the news section on the
   homepage will say "Headlines will appear here after the news updater
   runs on GitHub for the first time" — that's expected, not a bug.

(Optional) An AI-generated market digest can appear above the headlines
if you add an `ANTHROPIC_API_KEY` repository secret — without it, the
digest is simply skipped and headlines still work normally.

## 2. Live S&P 500 / NASDAQ quotes (lower priority)

The main ticker strip at the top of every page (Bitcoin, Ethereum, S&P
500, NASDAQ, Gold, EUR/USD) is a free TradingView widget and needs no
setup — it works out of the box.

The only thing this second workflow feeds is the small live-price
popup when you click VTI/VOO/BND mentions inside the ETF guide article.
It's the same pattern as news: create
`.github/workflows/update-quotes.yml` and
`.github/scripts/fetch-quotes.js` on GitHub the same way, then:
- Get a free key at https://twelvedata.com
- **Settings → Secrets and variables → Actions → New repository
  secret**, name it `TWELVE_DATA_API_KEY`, paste the key.
- Run the workflow once manually the same way as above.

## 3. Newsletter signup form

GitHub Pages has no server to receive form submissions, so the site
posts to [Formspree](https://formspree.io) instead (a free hosted form
backend built for exactly this).

- Create a free account at https://formspree.io and a new form.
- Copy its form ID (the short code in the endpoint URL).
- In `script.js`, find `const FORMSPREE_FORM_ID = 'YOUR_FORM_ID';` near
  `handleSubscribe` and replace `YOUR_FORM_ID` with it.
- Until this is done, the newsletter form will show an error on submit —
  no emails are being captured anywhere yet.
