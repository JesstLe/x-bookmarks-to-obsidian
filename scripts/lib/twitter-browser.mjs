import { parseTweetIdentity } from './bookmark-model.mjs';

const AUTH_PATTERNS = [/\/i\/flow\/login/i, /\/login(?:\/|$)/i];
const RATE_PATTERNS = [/rate limit/i, /too many requests/i, /请求过于频繁/i, /频率限制/i];
const ERROR_PATTERNS = [/something went wrong/i, /try reloading/i, /出错了/i, /重试/i];
const END_PATTERNS = [/you(?:'|’)ve reached the end/i, /end of (?:your )?bookmarks/i, /已经到底/i, /没有更多/i];

export function detectPageState({ url = '', bodyText = '' } = {}) {
  if (AUTH_PATTERNS.some((pattern) => pattern.test(url))) return 'auth_required';
  if (RATE_PATTERNS.some((pattern) => pattern.test(bodyText))) return 'rate_limited';
  if (END_PATTERNS.some((pattern) => pattern.test(bodyText))) return 'end_of_list';
  if (ERROR_PATTERNS.some((pattern) => pattern.test(bodyText))) return 'failed';
  return 'ready';
}

export function selectTweetById(articles, tweetId) {
  const id = String(tweetId);
  return articles.find((article) => (article.statusUrls || []).some((url) => {
    try {
      return parseTweetIdentity(url).id === id;
    } catch {
      return false;
    }
  })) || null;
}

function terminalReasonForState(state) {
  if (state === 'auth_required') return 'auth_required';
  if (state === 'rate_limited') return 'rate_limited';
  if (state === 'end_of_list') return 'end_of_list';
  if (state === 'failed') return 'failed';
  return null;
}

export async function discoverBookmarkUrls(page, {
  count = null,
  mode = 'count',
  maxNoProgressRounds = 5,
  scrollDelayMs = 1200,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!['count', 'all'].includes(mode)) throw new Error(`Invalid discovery mode: ${mode}`);
  if (mode === 'count' && (!Number.isInteger(count) || count <= 0)) {
    throw new Error('Count discovery requires a positive count');
  }
  if (!Number.isInteger(maxNoProgressRounds) || maxNoProgressRounds <= 0) {
    throw new Error('maxNoProgressRounds must be a positive integer');
  }

  const discovered = new Map();
  let noProgressRounds = 0;

  while (true) {
    const snapshot = await page.evaluate(() => {
      const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
      const statusUrls = articles.flatMap((article) => [...article.querySelectorAll('a[href*="/status/"]')]
        .map((anchor) => anchor.href)
        .filter(Boolean));
      const last = articles.at(-1);
      if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      return {
        url: window.location.href,
        bodyText: document.body?.innerText || '',
        statusUrls,
      };
    });

    const before = discovered.size;
    for (const rawUrl of snapshot.statusUrls || []) {
      try {
        const identity = parseTweetIdentity(rawUrl);
        discovered.set(identity.id, identity.url);
      } catch {
        // Ignore analytics, photo, malformed, and non-post URLs.
      }
    }

    if (mode === 'count' && discovered.size >= count) {
      return { urls: [...discovered.values()].slice(0, count), reason: 'requested_count' };
    }

    const pageState = detectPageState(snapshot);
    const terminal = terminalReasonForState(pageState);
    if (terminal) return { urls: [...discovered.values()], reason: terminal };

    if (discovered.size === before) noProgressRounds += 1;
    else noProgressRounds = 0;
    if (noProgressRounds >= maxNoProgressRounds) {
      return { urls: [...discovered.values()], reason: 'no_progress' };
    }
    await wait(scrollDelayMs);
  }
}

export async function extractTweetDetail(page, identity, {
  navigationTimeoutMs = 30000,
  selectorTimeoutMs = 12000,
  expandDelayMs = 500,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const canonical = parseTweetIdentity(identity.url);
  await page.goto(canonical.url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: selectorTimeoutMs });

  await page.evaluate((tweetId) => {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const matching = articles.find((article) => [...article.querySelectorAll('a[href*="/status/"]')]
      .some((anchor) => new RegExp(`/status/${tweetId}(?:/|$|\\?)`).test(anchor.href))) || articles[0];
    const button = matching?.querySelector('[data-testid="tweet-text-show-more-link"]')
      || [...(matching?.querySelectorAll('[role="button"]') || [])]
        .find((node) => /^(show more|显示更多)$/i.test(node.innerText?.trim() || ''));
    button?.click();
    return Boolean(button);
  }, canonical.id);
  await wait(expandDelayMs);

  const raw = await page.evaluate((tweetId) => {
    const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
    const article = articles.find((candidate) => [...candidate.querySelectorAll('a[href*="/status/"]')]
      .some((anchor) => new RegExp(`/status/${tweetId}(?:/|$|\\?)`).test(anchor.href))) || articles[0];
    if (!article) return null;

    const textElements = [...article.querySelectorAll('[data-testid="tweetText"]')];
    const userName = article.querySelector('[data-testid="User-Name"]');
    const profileHref = [...(userName?.querySelectorAll('a[href]') || [])]
      .map((anchor) => anchor.getAttribute('href'))
      .find((href) => /^\/[A-Za-z0-9_]+$/.test(href || ''));
    const handle = profileHref?.slice(1) || '';
    const author = userName?.innerText?.split('\n')[0]?.trim() || handle;

    const imageUrls = [...article.querySelectorAll('[data-testid="tweetPhoto"] img')]
      .map((image) => image.src)
      .filter(Boolean)
      .map((url) => {
        const parsed = new URL(url);
        if (parsed.hostname === 'pbs.twimg.com') parsed.searchParams.set('name', 'orig');
        return parsed.href;
      });

    const videos = [];
    const seenVideos = new Set();
    for (const container of article.querySelectorAll('video, [data-testid="videoPlayer"], [data-testid="gifPlayer"]')) {
      const video = container.matches('video') ? container : container.querySelector('video');
      const thumbnail = video?.poster || container.querySelector('img')?.src || null;
      const idMatch = thumbnail?.match(/\/([A-Za-z0-9_-]+)\/img\//);
      const videoId = idMatch?.[1] || null;
      const key = videoId || thumbnail || video?.src;
      if (!key || seenVideos.has(key)) continue;
      seenVideos.add(key);
      videos.push({ videoId, thumbnail, type: container.closest('[data-testid="gifPlayer"]') ? 'gif' : 'video' });
    }

    const statusUrls = [...article.querySelectorAll('a[href*="/status/"]')]
      .map((anchor) => anchor.href)
      .filter((url) => !url.includes('/analytics') && !url.includes('/photo/'));
    const quoteUrl = statusUrls.find((url) => {
      const match = url.match(/\/status\/(\d+)/);
      return match && match[1] !== tweetId;
    }) || null;
    const quoteHandle = quoteUrl?.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\//)?.[1] || '';

    const links = [...article.querySelectorAll('a[href^="http"]')]
      .filter((anchor) => {
        const host = new URL(anchor.href).hostname;
        return !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host);
      })
      .map((anchor) => ({ text: anchor.innerText?.trim() || anchor.href, url: anchor.href }));

    const parseMetric = (value) => {
      const normalized = String(value || '').replace(/,/g, '').trim();
      const match = normalized.match(/([\d.]+)\s*(万|千|[KMB])?/i);
      if (!match) return 0;
      const multipliers = { '千': 1e3, K: 1e3, '万': 1e4, M: 1e6, B: 1e9 };
      return Math.round(Number(match[1]) * (multipliers[match[2]?.toUpperCase?.() || match[2]] || 1));
    };
    const metric = (testId) => {
      const node = article.querySelector(`[data-testid="${testId}"]`);
      return parseMetric(node?.getAttribute('aria-label') || node?.innerText);
    };

    const unsupported = [];
    if (article.querySelector('[data-testid="card.wrapper"]')) unsupported.push('card');
    if (article.querySelector('[data-testid="poll"]')) unsupported.push('poll');
    if (article.querySelector('a[href*="/i/spaces/"]')) unsupported.push('space');
    if (article.querySelector('a[href*="/i/article/"]')) unsupported.push('article');

    return {
      author,
      handle,
      text: textElements[0]?.innerText || '',
      timestamp: article.querySelector('time')?.getAttribute('datetime') || '',
      images: [...new Set(imageUrls)],
      videos,
      links,
      quotedTweet: textElements[1] ? {
        author: quoteHandle,
        handle: quoteHandle,
        text: textElements[1].innerText || '',
        url: quoteUrl,
      } : null,
      stats: {
        replies: metric('reply'),
        retweets: metric('retweet') || metric('unretweet'),
        likes: metric('like') || metric('unlike'),
      },
      unsupported,
    };
  }, canonical.id);

  if (!raw) throw new Error(`Tweet detail unavailable: ${canonical.url}`);
  let quote = raw.quotedTweet;
  if (quote?.url) {
    try {
      const quoteIdentity = parseTweetIdentity(quote.url);
      quote = { ...quote, handle: quoteIdentity.handle, url: quoteIdentity.url };
    } catch {
      quote = { ...quote, url: null };
    }
  }
  return {
    ...raw,
    identity: canonical,
    handle: canonical.handle,
    tweetUrl: canonical.url,
    images: (raw.images || []).map((sourceUrl) => ({ sourceUrl })),
    videos: (raw.videos || []).map((video) => ({ ...video, sourceUrl: canonical.url })),
    quotedTweet: quote,
  };
}
