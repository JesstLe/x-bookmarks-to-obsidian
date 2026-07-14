const VALID_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const ID_PATTERN = /^\d{15,25}$/;

export function canonicalTweetUrl(handle, id) {
  const normalizedHandle = String(handle ?? '').replace(/^@/, '');
  const normalizedId = String(id ?? '');
  if (!HANDLE_PATTERN.test(normalizedHandle) || !ID_PATTERN.test(normalizedId)) {
    throw new Error(`Invalid tweet identity: @${normalizedHandle}/status/${normalizedId}`);
  }
  return `https://x.com/${normalizedHandle}/status/${normalizedId}`;
}

export function parseTweetIdentity(input) {
  let parsed;
  try {
    parsed = new URL(String(input));
  } catch {
    throw new Error(`Invalid tweet URL: ${input}`);
  }
  if (!VALID_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Invalid tweet host: ${parsed.hostname}`);
  }
  const match = parsed.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d{15,25})(?:\/|$)/);
  if (!match) {
    throw new Error(`Invalid tweet URL: ${input}`);
  }
  const [, handle, id] = match;
  return { handle, id, url: canonicalTweetUrl(handle, id) };
}

export function identityFromFilename(filename) {
  const match = String(filename).match(/ - @([A-Za-z0-9_]{1,15}) - (\d{15,25})\.md$/);
  if (!match) {
    throw new Error(`Cannot derive tweet identity from filename: ${filename}`);
  }
  const [, handle, id] = match;
  return { handle, id, url: canonicalTweetUrl(handle, id) };
}

export function escapeYamlString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
}
