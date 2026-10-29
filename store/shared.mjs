// Rules both stores share, so MySQL and the in-memory store order and filter posts the same way.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/**
 * Explore / "For you" ranking: likes plus double-weighted comments, divided by age so new posts
 * get a chance (the Hacker News formula). The MySQL store computes the same expression in SQL.
 */
export function rank(likeCount, commentCount, createdAt, now) {
  const hours = (now - createdAt) / HOUR;
  return (likeCount + 2 * commentCount + 1) / Math.pow(Math.max(hours, 0) + 2, 1.5);
}

/** Newest first; posts made in the same millisecond are ordered by id (as `ORDER BY created_at DESC, id DESC`). */
export const newestFirst = (a, b) => b.created_at - a.created_at || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0);

/** Hashtags: letters, digits and underscores (any language). */
export const TAG = /^[\p{L}\p{N}_]{1,60}$/u;

/** Regexes matching `#tag` as a whole word (case-insensitive), for JavaScript and for MySQL's REGEXP_LIKE. */
export function tagPattern(tag) {
  if (!TAG.test(tag)) throw new Error("Not a hashtag");
  return { js: `#${tag}(?![\\p{L}\\p{N}_])`, sql: `#${tag}([^\\p{L}\\p{N}_]|$)` };
}

/**
 * Feed pages continue after the last post shown: `<milliseconds>_<id>`, where the time is when the post
 * entered the feed (when it was shared, or when someone you follow reposted it).
 */
export const toCursor = (post) => `${+post.feed_at}_${post.id}`;

/** Of two ways a post reached the feed, the later wins; at the same moment, the original beats a repost. */
export const laterEvent = (a, b) =>
  !a || b.at > a.at || (+b.at === +a.at && (b.reposter ?? "") < (a.reposter ?? "")) ? b : a;

export function parseCursor(value) {
  const m = /^(\d{1,15})_([\w-]{1,36})$/.exec(typeof value === "string" ? value : "");
  return m ? { t: new Date(Number(m[1])), id: m[2] } : null;
}
