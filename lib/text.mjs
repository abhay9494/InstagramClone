// Text shown in the pages: captions with links, times ("3h"), counts ("12.5K"), and the rules for
// usernames, filters and photo shapes. Used by the routes and, through app.locals, by the EJS views.

/** Photo filters. They are CSS filters applied when the photo is shown, so a post's filter can be changed later. */
export const FILTERS = [
  { id: "normal", name: "Original", css: "none" },
  { id: "aden", name: "Aden", css: "hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)" },
  { id: "clarendon", name: "Clarendon", css: "contrast(1.2) saturate(1.35)" },
  { id: "crema", name: "Crema", css: "sepia(0.25) contrast(0.9) brightness(1.08) saturate(0.9)" },
  { id: "gingham", name: "Gingham", css: "brightness(1.05) hue-rotate(-10deg) saturate(0.85)" },
  { id: "juno", name: "Juno", css: "contrast(1.15) saturate(1.4) sepia(0.08)" },
  { id: "lark", name: "Lark", css: "contrast(0.9) brightness(1.08) saturate(1.15)" },
  { id: "ludwig", name: "Ludwig", css: "contrast(1.05) saturate(1.1) brightness(1.05) sepia(0.05)" },
  { id: "moon", name: "Moon", css: "grayscale(1) contrast(1.1) brightness(1.1)" },
  { id: "perpetua", name: "Perpetua", css: "contrast(1.1) brightness(1.15) saturate(1.1) hue-rotate(-8deg)" },
  { id: "reyes", name: "Reyes", css: "sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)" },
  { id: "slumber", name: "Slumber", css: "saturate(0.66) brightness(1.05) sepia(0.15)" },
];
export const FILTER_IDS = new Set(FILTERS.map((f) => f.id));

/** Photo shapes. The original image is kept; the shape is a crop applied when it is shown. */
export const ASPECTS = [
  { id: "square", name: "Square", ratio: "1 / 1" },
  { id: "portrait", name: "Portrait", ratio: "4 / 5" },
  { id: "landscape", name: "Landscape", ratio: "1.91 / 1" },
];
export const ASPECT_IDS = new Set(ASPECTS.map((a) => a.id));

/** The stylesheet for the filters, served at /filters.css. */
export const filtersCss = () => FILTERS.map((f) => `.f-${f.id}{filter:${f.css}}`).join("\n") + "\n";

// Usernames: 1–30 lowercase letters, digits, periods and underscores; no period at the start or end, no "..".
export const USERNAME = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;
/** Paths that are pages, so nobody can register them as a username. */
export const RESERVED = new Set([
  "about", "accounts", "activity", "admin", "api", "appearance", "audio", "catalog.css", "create", "direct", "explore",
  "favicon.ico", "help", "login", "logout", "media", "p", "posts", "reel", "reels", "robots.txt", "search", "settings",
  "signup", "stories", "uploads",
]);
export const LIMITS = { name: 60, bio: 150, caption: 2200, alt: 300, comment: 2200, password: 8 };

/** Length in characters as people count them (an emoji is one), the way MySQL counts VARCHAR length. */
export const length = (s) => [...s].length;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

// A # or @ right after a letter (as in an email address) does not start a link.
const TOKENS = /(?<![\p{L}\p{N}_])(#[\p{L}\p{N}_]{1,60}|@[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?)/giu;

/** A caption or comment as HTML: escaped, with #hashtags and @mentions as links. */
export function rich(text) {
  return String(text ?? "")
    .split(TOKENS)
    .map((part, i) => {
      if (i % 2 === 0) return escapeHtml(part);
      const word = part.slice(1).toLowerCase();
      const href = part[0] === "#" ? `/explore/tags/${encodeURIComponent(word)}` : `/${encodeURIComponent(word)}`;
      return `<a href="${href}" class="tag">${escapeHtml(part)}</a>`;
    })
    .join("");
}

/** Hashtags in a caption, lowercased and without the #. */
export const hashtags = (text) => [...String(text ?? "").matchAll(TOKENS)].map((m) => m[0]).filter((t) => t[0] === "#").map((t) => t.slice(1).toLowerCase());

const MINUTE = 60_000;
const UNITS = [["w", 7 * 24 * 60 * MINUTE], ["d", 24 * 60 * MINUTE], ["h", 60 * MINUTE], ["m", MINUTE]];
const LONG = { w: "week", d: "day", h: "hour", m: "minute" };
const monthDay = new Intl.DateTimeFormat("en", { month: "long", day: "numeric" });
const monthDayYear = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" });

/** "now", "5m", "3h", "2d", "4w", then a date — the short times on feed posts. */
export function ago(date, now = new Date()) {
  const ms = now - new Date(date);
  if (ms < MINUTE) return "now";
  if (ms >= 52 * UNITS[0][1]) return fullDate(date, now);
  const [unit, size] = UNITS.find(([, size]) => ms >= size);
  return `${Math.floor(ms / size)}${unit}`;
}

/** "5 minutes ago", "3 days ago", then "October 3" — the times under a post. */
export function agoLong(date, now = new Date()) {
  const ms = now - new Date(date);
  if (ms < MINUTE) return "Just now";
  if (ms >= 7 * UNITS[1][1]) return fullDate(date, now);
  const [unit, size] = UNITS.slice(1).find(([, size]) => ms >= size);
  const n = Math.floor(ms / size);
  return `${n} ${LONG[unit]}${n === 1 ? "" : "s"} ago`;
}

const timeOfDay = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });
const weekdayTime = new Intl.DateTimeFormat("en", { weekday: "short", hour: "numeric", minute: "2-digit" });
const dateTime = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "4:12 PM" today, "Mon 4:12 PM" this week, then "Oct 28, 4:12 PM" — the times between messages. */
export function clock(date, now = new Date()) {
  const d = new Date(date);
  if (d.toDateString() === now.toDateString()) return timeOfDay.format(d);
  if (now - d < 6 * 86_400_000) return weekdayTime.format(d);
  return dateTime.format(d);
}

export function fullDate(date, now = new Date()) {
  const d = new Date(date);
  return (d.getFullYear() === now.getFullYear() ? monthDay : monthDayYear).format(d);
}

/** 1,234 */
export const count = (n) => Number(n).toLocaleString("en-US");

/** 1,234 · 12.5K · 3.4M (profile counts, like Instagram) */
export function compact(n) {
  if (n < 10_000) return count(n);
  if (n < 1_000_000) return `${(Math.floor(n / 100) / 10).toString()}K`;
  return `${(Math.floor(n / 100_000) / 10).toString()}M`;
}

export const plural = (n, word, many = `${word}s`) => `${count(n)} ${n === 1 ? word : many}`;

export const avatarOf = (user) => user?.avatar || "/default-avatar.svg";
export const altOf = (post) => post.alt || `Photo by ${post.user.name || post.user.username}`;
