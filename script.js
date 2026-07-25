// ===========================
// FINTORRA — SCRIPTS
// ===========================

// ===========================
// LIVE TICKER (BTC, GOLD, EUR/USD)
// Refreshes every 60s using free public APIs (no key required)
// ===========================
let lastEurUsd = null;
let lastGold = null;
const movers = {};

// setTicker previously also updated the scrolling ticker-item strip above
// the nav; that strip was removed site-wide in favor of the dashboard
// cards below, so this now only tracks freshness. Kept as a named
// function (rather than inlining markFresh at every call site) so the
// many callers below didn't all need touching.
function setTicker(symbol) {
  markFresh(symbol);
}

// ===========================
// STALE-DATA TRACKING
// A visitor should never silently see minutes/hours-old prices with no
// indication anything is wrong. We track the last successful update per
// symbol and flag the UI once data hasn't refreshed for 2+ cycles (>=150s).
// ===========================
const lastUpdated = {};
const STALE_AFTER_MS = 150000; // 2.5 refresh cycles at 60s

function markFresh(symbol) {
  lastUpdated[symbol] = Date.now();
  document.querySelectorAll(`[data-symbol="${symbol}"]`).forEach(el => {
    el.classList.remove('is-stale');
    el.removeAttribute('title');
  });
}

function markStale(symbol, label) {
  document.querySelectorAll(`[data-symbol="${symbol}"]`).forEach(el => {
    el.classList.add('is-stale');
    el.setAttribute('title', `${label || symbol}: live update failed — showing last known price.`);
  });
}

function checkStaleness() {
  const now = Date.now();
  Object.keys(lastUpdated).forEach(symbol => {
    if (now - lastUpdated[symbol] > STALE_AFTER_MS) {
      markStale(symbol);
    }
  });
}
setInterval(checkStaleness, 30000);

// ===========================
// "Updated Xs ago" labels (Bloomberg-style timestamp next to each figure)
// Ticks independently of the 60s fetch cycle so the number climbs
// smoothly (1s ago, 2s ago...) instead of jumping in 60s steps.
// ===========================
function formatAgo(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
function renderUpdatedLabels() {
  document.querySelectorAll('[data-updated]').forEach(el => {
    const symbol = el.getAttribute('data-updated');
    const ts = lastUpdated[symbol];
    el.textContent = ts ? `Updated ${formatAgo(Date.now() - ts)}` : 'Updating…';
  });
}
setInterval(renderUpdatedLabels, 1000);

// ===========================
// Watchlist (item 3) — a starred symbol persists across visits via
// localStorage; no account/backend needed for a client-only feature.
// ===========================
const WATCHLIST_KEY = 'fintorra-watchlist';
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || []; }
  catch (e) { return []; }
}
function setWatchlist(list) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); } catch (e) {}
}
function applyWatchlistState() {
  const list = getWatchlist();
  document.querySelectorAll('.watch-star').forEach(btn => {
    const symbol = btn.getAttribute('data-watch');
    const isWatched = list.includes(symbol);
    btn.classList.toggle('is-watched', isWatched);
    btn.setAttribute('aria-pressed', String(isWatched));
    btn.textContent = isWatched ? '★' : '☆';
    const card = btn.closest('.dash-card');
    if (card) card.classList.toggle('is-watched', isWatched);
  });
}
document.querySelectorAll('.watch-star').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const symbol = btn.getAttribute('data-watch');
    const list = getWatchlist();
    const idx = list.indexOf(symbol);
    if (idx === -1) list.push(symbol); else list.splice(idx, 1);
    setWatchlist(list);
    applyWatchlistState();
  });
});
applyWatchlistState();

// ===========================
// Clickable in-article ticker mentions (item 5) — e.g. "VTI" inside a
// guide's body text. Reuses the same data/quotes.json payload already
// fetched for the S&P 500/NASDAQ cards (see updateIndices above), so
// this adds no extra network requests.
// ===========================
let activePopover = null;
function closeTickerPopover() {
  if (activePopover) { activePopover.remove(); activePopover = null; }
}
function showTickerPopover(anchorEl, key) {
  closeTickerPopover();
  const entry = latestQuotes && latestQuotes[key];
  const pop = document.createElement('div');
  pop.className = 'ticker-popover';
  if (!entry) {
    pop.innerHTML = `<div class="ticker-popover-label">Price unavailable right now</div>`;
  } else {
    const isUp = entry.change >= 0;
    const arrow = isUp ? '▲' : '▼';
    const sign = isUp ? '+' : '';
    pop.innerHTML = `
      <div class="ticker-popover-label">${entry.label}</div>
      <div class="ticker-popover-price">$${entry.price.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
      <div class="ticker-popover-change ${isUp ? 'up' : 'down'}">${arrow} ${sign}${entry.change.toFixed(2)}%</div>
    `;
  }
  document.body.appendChild(pop);
  const rect = anchorEl.getBoundingClientRect();
  pop.style.left = `${rect.left + window.scrollX}px`;
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`;
  activePopover = pop;
}
function refreshTickerMentionPopovers() {
  // Re-render an open popover in place if new data just arrived, so it
  // doesn't show a stale number if left open across a refresh cycle.
  if (activePopover && activePopover.dataset.forKey) {
    const anchor = document.querySelector(`.ticker-mention[data-ticker="${activePopover.dataset.forKey}"]`);
    if (anchor) showTickerPopover(anchor, activePopover.dataset.forKey);
  }
}
document.querySelectorAll('.ticker-mention').forEach(el => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = el.getAttribute('data-ticker');
    if (activePopover && activePopover.dataset.forKey === key) { closeTickerPopover(); return; }
    showTickerPopover(el, key);
    activePopover.dataset.forKey = key;
  });
});
document.addEventListener('click', (e) => {
  if (activePopover && !e.target.closest('.ticker-mention')) closeTickerPopover();
});

function sparklinePoints(changePercent) {
  const isUp = changePercent >= 0;
  const totalPoints = 24;
  const width = 100;
  const midY = 15;
  const amp = Math.min(Math.abs(changePercent) * 2.2, 11);
  const trend = isUp ? -amp : amp; // SVG y grows downward, so "up" means decreasing y
  const startOffset = isUp ? 5 : -5;

  // Deterministic pseudo-random noise seeded from the change value,
  // so the shape stays stable between re-renders of the same data point.
  let seed = Math.abs(Math.round(changePercent * 1000)) || 7;
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  const pts = [];
  for (let i = 0; i <= totalPoints; i++) {
    const progress = i / totalPoints;
    const x = width * progress;
    const target = midY + startOffset + trend * progress;
    const noise = (rand() - 0.5) * 5.5;
    let y = target + noise;
    y = Math.max(2, Math.min(28, y));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function updateTopMover() {
  const entries = Object.entries(movers);
  if (!entries.length) return;
  let top = entries[0];
  for (const e of entries) {
    if (Math.abs(e[1].change) > Math.abs(top[1].change)) top = e;
  }
  const el = document.getElementById('top-mover-value');
  if (el) {
    const info = top[1];
    const isUp = info.change >= 0;
    el.textContent = `${info.label}  ${isUp ? '▲' : '▼'} ${isUp ? '+' : ''}${info.change.toFixed(2)}%`;
    el.style.color = isUp ? 'var(--green)' : 'var(--red)';
  }
}

function setDashCard(symbol, label, priceText, changePercent) {
  movers[symbol] = { label, change: changePercent };
  updateTopMover();

  // The visual dashboard cards were replaced by the TradingView Ticker
  // Tape widget, so there's usually no .dash-card to update anymore —
  // this just becomes a no-op below, which is fine.
  const card = document.querySelector(`.dash-card[data-symbol="${symbol}"]`);
  if (!card) return;
  const isUp = changePercent >= 0;
  const priceEl = card.querySelector('[data-price]');
  const changeEl = card.querySelector('[data-change]');
  const sparkEl = card.querySelector('[data-spark]');
  if (priceEl) priceEl.textContent = priceText;
  if (changeEl) {
    changeEl.textContent = `${isUp ? '+' : ''}${changePercent.toFixed(2)}%`;
    changeEl.classList.remove('up', 'down');
    changeEl.classList.add(isUp ? 'up' : 'down');
  }
  if (sparkEl) {
    sparkEl.setAttribute('points', sparklinePoints(changePercent));
    sparkEl.classList.remove('up', 'down');
    sparkEl.classList.add(isUp ? 'up' : 'down');
  }
}

async function updateBtc() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
    const data = await res.json();
    const btcPrice = data.bitcoin.usd;
    const btcChange = data.bitcoin.usd_24h_change;
    const btcUp = btcChange >= 0;
    setTicker('btc', `BTC/USD  $${btcPrice.toLocaleString(undefined, {maximumFractionDigits: 0})} ${btcUp ? '▲' : '▼'} ${btcUp ? '+' : ''}${btcChange.toFixed(2)}%`, btcUp);
    setDashCard('btc', 'Bitcoin', `$${btcPrice.toLocaleString(undefined, {maximumFractionDigits: 0})}`, btcChange);

    const ethPrice = data.ethereum.usd;
    const ethChange = data.ethereum.usd_24h_change;
    const ethUp = ethChange >= 0;
    setTicker('eth', `ETH/USD  $${ethPrice.toLocaleString(undefined, {maximumFractionDigits: 0})} ${ethUp ? '▲' : '▼'} ${ethUp ? '+' : ''}${ethChange.toFixed(2)}%`, ethUp);
    setDashCard('eth', 'Ethereum', `$${ethPrice.toLocaleString(undefined, {maximumFractionDigits: 0})}`, ethChange);
  } catch (err) {
    console.error('BTC/ETH price fetch failed:', err);
    markStale('btc', 'Bitcoin');
    markStale('eth', 'Ethereum');
  }
}

async function updateGold() {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU');
    const data = await res.json();
    const price = data.price;
    let isUp = true;
    let changeText = '';
    let change = 0;
    if (lastGold !== null) {
      change = ((price - lastGold) / lastGold) * 100;
      isUp = change >= 0;
      const sign = isUp ? '+' : '';
      changeText = ` ${isUp ? '▲' : '▼'} ${sign}${change.toFixed(2)}%`;
    }
    lastGold = price;
    setTicker('gold', `GOLD  $${price.toLocaleString(undefined, {maximumFractionDigits: 0})}${changeText}`, isUp);
    setDashCard('gold', 'Gold', `$${price.toLocaleString(undefined, {maximumFractionDigits: 0})}`, change);
  } catch (err) {
    console.error('Gold price fetch failed:', err);
    markStale('gold', 'Gold');
  }
}

async function updateEurUsd() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
    const data = await res.json();
    const rate = data.rates.USD;
    let isUp = true;
    let changeText = '';
    let change = 0;
    if (lastEurUsd !== null) {
      change = ((rate - lastEurUsd) / lastEurUsd) * 100;
      isUp = change >= 0;
      const sign = isUp ? '+' : '';
      changeText = ` ${isUp ? '▲' : '▼'} ${sign}${change.toFixed(2)}%`;
    }
    lastEurUsd = rate;
    setTicker('eurusd', `EUR/USD  ${rate.toFixed(4)}${changeText}`, isUp);
    setDashCard('eurusd', 'EUR/USD', rate.toFixed(4), change);
  } catch (err) {
    console.error('EUR/USD fetch failed:', err);
    markStale('eurusd', 'EUR/USD');
  }
}

// ===========================
// S&P 500 / NASDAQ — read from a static JSON file instead of calling
// Twelve Data directly from the browser (that would need the API key
// exposed client-side) or via a serverless proxy (GitHub Pages can't run
// one). Instead, .github/workflows/update-quotes.yml runs on a schedule,
// calls Twelve Data with a key stored in GitHub Secrets, and commits the
// result to data/quotes.json. This file only updates every ~15 minutes
// (GitHub Actions' practical minimum), unlike BTC/Gold/EUR-USD above
// which stay true 60-second live client-side calls to keyless APIs.
// ===========================
const QUOTES_MAX_AGE_MS = 45 * 60 * 1000; // 3x the 15-min schedule, allows for Action delays
let latestQuotes = null; // cached for the in-article ETF ticker popovers (see popover section below)

async function updateIndices() {
  try {
    const res = await fetch(`data/quotes.json?_=${Date.now()}`); // cache-bust
    if (!res.ok) throw new Error(`quotes.json returned ${res.status}`);
    const data = await res.json();
    latestQuotes = data;

    const isFresh = data.updatedAt && (Date.now() - new Date(data.updatedAt).getTime()) < QUOTES_MAX_AGE_MS;

    ['sp500', 'nasdaq'].forEach((key) => {
      const entry = data[key];
      if (!entry) { markStale(key); return; }
      const { label, price, change } = entry;
      const isUp = change >= 0;
      const arrow = isUp ? '▲' : '▼';
      const sign = isUp ? '+' : '';
      setTicker(key, `${label}  ${price.toLocaleString(undefined, {maximumFractionDigits: 0})} ${arrow} ${sign}${change.toFixed(2)}%`, isUp);
      setDashCard(key, label, price.toLocaleString(undefined, {maximumFractionDigits: 0}), change);
      if (!isFresh) markStale(key, label); // file exists but the Action hasn't run recently
    });

    refreshTickerMentionPopovers(isFresh);
  } catch (err) {
    console.error('Index quotes fetch failed:', err);
    markStale('sp500', 'S&P 500');
    markStale('nasdaq', 'NASDAQ');
  }
}

function refreshTicker() {
  updateBtc();
  updateGold();
  updateEurUsd();
  updateIndices();
  // Note: 10Y Treasury yield was removed from the ticker — Twelve Data's
  // free tier doesn't cover bond yields, only equities/indices/forex/crypto.
}

if (document.querySelector('.ticker-tape-wrap')) {
  refreshTicker();
  setInterval(refreshTicker, 60000); // refresh every 60 seconds
}

// FAQ accordion — event-delegated (no inline onclick=""), and announces
// open/closed state to screen readers via aria-expanded.
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => {
    const answer = btn.nextElementSibling;
    const isOpen = btn.classList.contains('open');

    document.querySelectorAll('.faq-q').forEach(q => {
      q.classList.remove('open');
      q.setAttribute('aria-expanded', 'false');
      q.nextElementSibling.classList.remove('open');
    });

    if (!isOpen) {
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      answer.classList.add('open');
    }
  });
});

// Newsletter submit
// GitHub Pages can't run a server, so this posts to Formspree (a hosted
// form backend made for static sites) instead of a custom serverless
// function.
//
// SETUP REQUIRED (one-time):
//   1. Create a free account at https://formspree.io
//   2. Create a new form, copy its endpoint ID (looks like "xyzabcde")
//   3. Replace YOUR_FORM_ID below with it.
// Until that's done, every submission will fail with a 404 — the emails
// are NOT captured anywhere yet.
const FORMSPREE_FORM_ID = 'YOUR_FORM_ID';

async function handleSubscribe(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button');
  const input = form.querySelector('input');
  const email = input.value;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Subscribing…';
  try {
    const res = await fetch(`https://formspree.io/f/${FORMSPREE_FORM_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(`Formspree returned ${res.status}`);
    btn.textContent = '✓ You\'re in!';
    btn.style.background = '#1A9B5E';
    input.value = '';
    input.disabled = true;
  } catch (err) {
    console.error('Newsletter subscribe failed:', err);
    btn.disabled = false;
    btn.textContent = originalLabel;
    const note = form.querySelector('.subscribe-error') || document.createElement('p');
    note.className = 'subscribe-error';
    note.textContent = 'Something went wrong — please try again in a moment.';
    if (!form.querySelector('.subscribe-error')) form.appendChild(note);
  }
}

// Dark/light theme toggle (preference saved in localStorage)
(function () {
  const root = document.documentElement;
  const toggleBtn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('fintorra-theme') || 'dark';

  function applyTheme(theme) {
    const sunSVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    const moonSVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      if (toggleBtn) toggleBtn.innerHTML = sunSVG;
    } else {
      root.removeAttribute('data-theme');
      if (toggleBtn) toggleBtn.innerHTML = moonSVG;
    }
  }

  applyTheme(saved === 'dark' ? 'dark' : 'light');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isDark = root.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('fintorra-theme', next);
    });
  }
})();

// Mobile hamburger (simple toggle)
const hamburger = document.getElementById('hamburger');
if (hamburger) {
  hamburger.addEventListener('click', () => {
    const links = document.querySelector('.nav-links');
    if (links) links.classList.toggle('nav-links-open');
  });
}

// ===========================
// TradingView chart modal — click any ticker (top strip, every page) or
// dashboard card (homepage) to open a free embedded TradingView chart.
// No API key or account needed; tv.js is TradingView's public widget
// script, loaded once on first click (not on every page load).
// ===========================
const TV_SYMBOLS = {
  btc: { symbol: 'COINBASE:BTCUSD', label: 'Bitcoin' },
  eth: { symbol: 'COINBASE:ETHUSD', label: 'Ethereum' },
  sp500: { symbol: 'TVC:SPX', label: 'S&P 500' },
  nasdaq: { symbol: 'TVC:IXIC', label: 'NASDAQ Composite' },
  gold: { symbol: 'TVC:GOLD', label: 'Gold' },
  eurusd: { symbol: 'FX:EURUSD', label: 'EUR/USD' },
};

let tvScriptLoaded = false;
function loadTradingViewScript(onReady) {
  if (tvScriptLoaded) { onReady(); return; }
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/tv.js';
  script.onload = () => { tvScriptLoaded = true; onReady(); };
  document.head.appendChild(script);
}

function ensureTvModal() {
  let modal = document.getElementById('tv-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'tv-modal';
  modal.className = 'tv-modal';
  modal.innerHTML = `
    <div class="tv-modal-panel">
      <div class="tv-modal-head">
        <span class="tv-modal-title" id="tv-modal-title">Chart</span>
        <button class="tv-modal-close" id="tv-modal-close" aria-label="Close chart" type="button">✕</button>
      </div>
      <div id="tv-chart-container"></div>
      <p class="tv-modal-credit">Chart by TradingView</p>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeTvModal(); });
  document.getElementById('tv-modal-close').addEventListener('click', closeTvModal);
  return modal;
}

function closeTvModal() {
  const modal = document.getElementById('tv-modal');
  if (modal) modal.classList.remove('is-open');
  document.body.style.overflow = '';
}

function openTvChart(key) {
  const info = TV_SYMBOLS[key];
  if (!info) return;
  const modal = ensureTvModal();
  document.getElementById('tv-modal-title').textContent = info.label;
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  loadTradingViewScript(() => {
    document.getElementById('tv-chart-container').innerHTML = '';
    new TradingView.widget({
      autosize: true,
      symbol: info.symbol,
      interval: '60',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#161B22',
      enable_publishing: false,
      hide_top_toolbar: false,
      allow_symbol_change: false,
      container_id: 'tv-chart-container',
    });
  });
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTvModal(); });

document.querySelectorAll('.dash-card[data-symbol]').forEach(el => {
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => openTvChart(el.getAttribute('data-symbol')));
});

// ===========================
// Market News block (homepage) — reads data/news.json, written by
// .github/workflows/update-news.yml from free RSS feeds. Shows title +
// the feed's own short summary + source + link, never a rewritten copy
// of the article body (see fetch-news.js for why).
// ===========================
let allNewsItems = [];

function timeAgoFromDate(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diffMs / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

let currentRenderedNews = [];
function renderNews(items) {
  const list = document.getElementById('news-list');
  if (!list) return;
  currentRenderedNews = items;
  if (!items.length) {
    list.innerHTML = '<p class="news-empty">No headlines match your search.</p>';
    return;
  }
  list.innerHTML = items.map((item, i) => `
    <button class="news-item" data-news-index="${i}" type="button">
      <div class="news-item-source">${item.source} · ${timeAgoFromDate(item.pubDate)}</div>
      <h3 class="news-item-title">${item.title}</h3>
      ${item.summary ? `<p class="news-item-summary">${item.summary}</p>` : ''}
    </button>
  `).join('');
  list.querySelectorAll('.news-item').forEach(btn => {
    btn.addEventListener('click', () => openNewsPopup(currentRenderedNews[parseInt(btn.getAttribute('data-news-index'), 10)]));
  });
}

// News popup — shows the headline, source, and the feed's own short
// excerpt in an in-page overlay instead of navigating away. This is
// deliberately NOT the full article body: the RSS feeds only ever
// provide title + short excerpt, and reproducing a full article here
// would raise real copyright/ToS problems with the source publishers.
// "Read full article" still opens the source for the complete piece.
function ensureNewsModal() {
  let modal = document.getElementById('news-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'news-modal';
  modal.className = 'tv-modal';
  modal.innerHTML = `
    <div class="tv-modal-panel news-modal-panel">
      <div class="tv-modal-head">
        <span class="tv-modal-title" id="news-modal-source"></span>
        <button class="tv-modal-close" id="news-modal-close" aria-label="Close" type="button">✕</button>
      </div>
      <h3 class="news-modal-title" id="news-modal-title"></h3>
      <p class="news-modal-meta" id="news-modal-meta"></p>
      <p class="news-modal-summary" id="news-modal-summary"></p>
      <a class="btn-primary sm" id="news-modal-link" rel="noopener" target="_blank">Read full article →</a>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeNewsModal(); });
  document.getElementById('news-modal-close').addEventListener('click', closeNewsModal);
  return modal;
}
function closeNewsModal() {
  const modal = document.getElementById('news-modal');
  if (modal) modal.classList.remove('is-open');
  document.body.style.overflow = '';
}
function openNewsPopup(item) {
  if (!item) return;
  const modal = ensureNewsModal();
  document.getElementById('news-modal-source').textContent = item.source;
  document.getElementById('news-modal-title').textContent = item.title;
  document.getElementById('news-modal-meta').textContent = timeAgoFromDate(item.pubDate);
  document.getElementById('news-modal-summary').textContent = item.summary || 'No summary available for this story.';
  document.getElementById('news-modal-link').href = item.link;
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNewsModal(); });

async function loadNews() {
  const list = document.getElementById('news-list');
  if (!list) return;
  try {
    const res = await fetch(`data/news.json?_=${Date.now()}`);
    if (!res.ok) throw new Error(`news.json returned ${res.status}`);
    const data = await res.json();
    allNewsItems = data.items || [];

    const summaryCard = document.getElementById('ai-summary-card');
    const summaryText = document.getElementById('ai-summary-text');
    if (summaryCard && summaryText && data.aiSummary) {
      summaryText.textContent = data.aiSummary;
      summaryCard.style.display = 'block';
    }

    if (!allNewsItems.length) {
      list.innerHTML = '<p class="news-empty">Headlines will appear here after the news updater runs on GitHub for the first time. See SETUP.md for the one-time setup step.</p>';
      return;
    }
    renderNews(allNewsItems);
  } catch (err) {
    console.error('News fetch failed:', err);
    list.innerHTML = '<p class="news-empty">Couldn\'t load headlines right now.</p>';
  }
}

const newsSearchInput = document.getElementById('news-search');
if (newsSearchInput) {
  newsSearchInput.addEventListener('input', () => {
    const q = newsSearchInput.value.trim().toLowerCase();
    const filtered = q ? allNewsItems.filter(i => i.title.toLowerCase().includes(q)) : allNewsItems;
    renderNews(filtered);
  });
}
if (document.getElementById('news-list')) loadNews();

