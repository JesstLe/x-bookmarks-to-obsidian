import { parseTweetIdentity } from './bookmark-model.mjs';

const AUTH_PATTERNS = [/\/i\/flow\/login/i, /\/login(?:\/|$)/i];
const RATE_PATTERNS = [/rate limit/i, /too many requests/i, /请求过于频繁/i, /频率限制/i];
const ERROR_PATTERNS = [/something went wrong/i, /try reloading/i, /出错了/i, /重试/i];
const END_PATTERNS = [/you(?:'|’)ve reached the end/i, /end of (?:your )?bookmarks/i, /已经到底/i, /没有更多/i];

export function detectPageState({ url = '', bodyText = '', stateText } = {}) {
  const platformText = stateText ?? bodyText;
  if (AUTH_PATTERNS.some((pattern) => pattern.test(url))) return 'auth_required';
  if (RATE_PATTERNS.some((pattern) => pattern.test(platformText))) return 'rate_limited';
  if (END_PATTERNS.some((pattern) => pattern.test(platformText))) return 'end_of_list';
  if (ERROR_PATTERNS.some((pattern) => pattern.test(platformText))) return 'failed';
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

export function selectBookmarkStatusUrls(articles) {
  return (articles || []).map((article) => article.timeUrl).filter(Boolean);
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
  maxNoProgressRounds = 12,
  scrollDelayMs = 1500,
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
      const articleLinks = articles.map((article) => ({
        timeUrl: article.querySelector('time')?.closest('a[href*="/status/"]')?.href || null,
      }));
      const last = articles.at(-1);
      if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      return {
        url: window.location.href,
        bodyText: document.body?.innerText || '',
        stateText: [...document.querySelectorAll('main *')]
          .filter((node) => !node.closest('article[data-testid="tweet"]') && node.children.length === 0)
          .map((node) => node.textContent?.trim() || '')
          .filter(Boolean)
          .join('\n'),
        articles: articleLinks,
        scrollHeight: document.documentElement.scrollHeight,
        lastTimeUrl: articleLinks.at(-1)?.timeUrl || null,
      };
    });

    const before = discovered.size;
    const candidateUrls = snapshot.articles
      ? selectBookmarkStatusUrls(snapshot.articles)
      : (snapshot.statusUrls || []);
    for (const rawUrl of candidateUrls) {
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

    if (typeof page.waitForFunction === 'function') {
      try {
        await page.waitForFunction(({ previousHeight, previousLastUrl }) => {
          const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];
          const lastTimeUrl = articles.at(-1)
            ?.querySelector('time')
            ?.closest('a[href*="/status/"]')
            ?.href || null;
          return document.documentElement.scrollHeight !== previousHeight
            || lastTimeUrl !== previousLastUrl;
        }, {
          polling: 250,
          timeout: Math.max(3000, scrollDelayMs * 2),
        }, {
          previousHeight: snapshot.scrollHeight,
          previousLastUrl: snapshot.lastTimeUrl,
        });
        await wait(Math.min(100, scrollDelayMs));
      } catch {
        // A timeout is a no-progress observation, not a fatal browser error.
      }
    } else {
      await wait(scrollDelayMs);
    }
  }
}

export async function resolveQuoteUrlFromCard(page, tweetId, { timeoutMs = 5000 } = {}) {
  if (typeof page?.url !== 'function') return null;
  const before = page.url();
  const clicked = await page.evaluate((requestedId) => {
    const article = [...document.querySelectorAll('article[data-testid="tweet"]')]
      .find((candidate) => [...candidate.querySelectorAll('a[href*="/status/"]')]
        .some((anchor) => new RegExp(`/status/${requestedId}(?:/|$|\\?)`).test(anchor.href)));
    const quoteText = article?.querySelectorAll('[data-testid="tweetText"]')?.[1];
    const quoteCard = quoteText?.closest('[role="link"]');
    if (!quoteCard || quoteCard.tagName === 'A') return false;
    quoteCard.click();
    return true;
  }, String(tweetId));
  if (!clicked) return null;
  try {
    await page.waitForFunction(
      (previousUrl) => window.location.href !== previousUrl,
      { timeout: timeoutMs },
      before,
    );
  } catch {
    return null;
  }
  try {
    const identity = parseTweetIdentity(page.url());
    return identity.id === String(tweetId) ? null : identity.url;
  } catch {
    return null;
  }
}

export function repairBrokenWrappedText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/(https?:\/\/|www\.)\n\n(?=[A-Za-z0-9])/g, '$1')
    .replace(/((?:https?:\/\/)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?)\n\n(?=[A-Za-z0-9/_~!$&'()*+,;=:@%#?-])/g, '$1')
    .replace(/([A-Za-z0-9._~!$&'()*+,;=:@%/-]+)\n\n-(?=[A-Za-z0-9])/g, '$1-');
}

export async function extractExpandedQuoteDetail(page, quoteUrl, {
  navigationTimeoutMs = 30000,
  selectorTimeoutMs = 12000,
  expandDelayMs = 500,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const canonical = parseTweetIdentity(quoteUrl);
  let currentIdentity = null;
  try {
    currentIdentity = typeof page?.url === 'function' ? parseTweetIdentity(page.url()) : null;
  } catch {
    currentIdentity = null;
  }
  if (currentIdentity?.id !== canonical.id) {
    await page.goto(canonical.url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
  }
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: selectorTimeoutMs });

  const expandedCount = await page.evaluate((tweetId) => {
    const article = [...document.querySelectorAll('article[data-testid="tweet"]')]
      .find((candidate) => [...candidate.querySelectorAll('a[href*="/status/"]')]
        .some((anchor) => new RegExp(`/status/${tweetId}(?:/|$|\\?)`).test(anchor.href)));
    if (!article) return 0;
    const clicked = new Set();
    const clickIfShowMore = (node) => {
      const label = (node?.innerText || node?.textContent || '').trim();
      if (!/^(show more|显示更多)$/i.test(label) || clicked.has(node)) return;
      node.click();
      clicked.add(node);
    };
    article.querySelectorAll('[data-testid="tweet-text-show-more-link"], button, a, span')
      .forEach(clickIfShowMore);
    return clicked.size;
  }, canonical.id);
  if (expandedCount > 0) await wait(expandDelayMs);

  const detail = await page.evaluate((tweetId) => {
    const article = [...document.querySelectorAll('article[data-testid="tweet"]')]
      .find((candidate) => [...candidate.querySelectorAll('a[href*="/status/"]')]
        .some((anchor) => new RegExp(`/status/${tweetId}(?:/|$|\\?)`).test(anchor.href)));
    if (!article) return null;
    const userName = article.querySelector('[data-testid="User-Name"]');
    const profileHref = [...(userName?.querySelectorAll('a[href]') || [])]
      .map((anchor) => anchor.getAttribute('href'))
      .find((href) => /^\/[A-Za-z0-9_]+$/.test(href || ''));
    const handle = profileHref?.slice(1) || '';
    return {
      author: userName?.innerText?.split('\n')[0]?.trim() || handle,
      handle,
      text: article.querySelector('[data-testid="tweetText"]')?.innerText || '',
    };
  }, canonical.id);
  if (!detail) throw new Error(`Quoted tweet detail unavailable: ${canonical.url}`);
  return {
    ...detail,
    handle: canonical.handle,
    text: repairBrokenWrappedText(detail.text),
    url: canonical.url,
  };
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
      .some((anchor) => new RegExp(`/status/${tweetId}(?:/|$|\\?)`).test(anchor.href)));
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
      .some((anchor) => new RegExp(`/status/${tweetId}(?:/|$|\\?)`).test(anchor.href)));
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
  if (quote && !quote.url) {
    const resolvedUrl = await resolveQuoteUrlFromCard(page, canonical.id);
    if (resolvedUrl) quote = { ...quote, url: resolvedUrl };
  }
  if (quote?.url) {
    try {
      const quoteIdentity = parseTweetIdentity(quote.url);
      quote = { ...quote, handle: quoteIdentity.handle, url: quoteIdentity.url };
    } catch {
      quote = { ...quote, url: null };
    }
  }
  if (quote?.url) {
    try {
      const expandedQuote = await extractExpandedQuoteDetail(page, quote.url, {
        navigationTimeoutMs,
        selectorTimeoutMs,
        expandDelayMs,
        wait,
      });
      quote = { ...quote, ...expandedQuote };
    } catch {
      quote = { ...quote, text: repairBrokenWrappedText(quote.text) };
    }
  }
  return {
    ...raw,
    identity: canonical,
    handle: canonical.handle,
    tweetUrl: canonical.url,
    images: (raw.images || []).map((sourceUrl) => ({ sourceUrl })),
    videos: (raw.videos || []).map((video) => ({ ...video, sourceUrl: canonical.url })),
    text: repairBrokenWrappedText(raw.text),
    links: (raw.links || []).map((link) => ({ ...link, text: repairBrokenWrappedText(link.text) })),
    quotedTweet: quote,
  };
}
