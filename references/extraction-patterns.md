# X extraction patterns

These selectors are implementation observations, not stable API guarantees. Every failure must become a structured run result instead of silently producing an empty note.

## Bookmark discovery

```javascript
document.querySelectorAll('article[data-testid="tweet"]')
article.querySelectorAll('a[href*="/status/"]')
```

Canonicalize every candidate URL and deduplicate by numeric tweet ID. Ignore analytics and photo URLs. A list run terminates only on the requested unique count, an explicit end marker, authentication, rate limiting, an X error, or a configured no-progress failure.

## Target detail article

Select only the article containing `/status/<requested-id>`. If the exact ID is absent, fail the detail extraction; never fall back to the first reply or recommendation.

## Text and author

```javascript
article.querySelector('[data-testid="tweet-text-show-more-link"]')
article.querySelectorAll('[data-testid="tweetText"]')
article.querySelector('[data-testid="User-Name"]')
article.querySelector('time')
```

The first `tweetText` is the requested post. A second element inside the same article can be quoted text. X may render its quote card as a `div[role="link"]` without an `href`; click only that second-text card, then canonicalize the navigation target and require a different tweet ID.

## Media

```javascript
article.querySelectorAll('[data-testid="tweetPhoto"] img')
article.querySelectorAll('video, [data-testid="videoPlayer"], [data-testid="gifPlayer"]')
```

Convert `pbs.twimg.com` images to `name=orig`. Deduplicate video DOM matches by extracted video ID or thumbnail, then let yt-dlp enumerate the post's real media entries. Verify local videos with ffprobe before embedding.

## Explicit page states

- URL contains `/i/flow/login`: `auth_required`
- Non-tweet system text contains “Rate limit exceeded” or equivalent: `rate_limited`
- Non-tweet system text contains “Something went wrong” or equivalent: `failed`
- Non-tweet system text contains an explicit end-of-bookmarks marker: `end_of_list`

Never classify words inside a bookmarked post as a platform error or rate limit.

Missing selectors, empty detail articles, unsupported cards, polls, Spaces, and Articles must be reported. They are not proof of a successfully archived full post.
