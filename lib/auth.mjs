// Accounts: password hashing (scrypt), signed session cookies, and a limit on failed logins.
// There is no session table: the cookie holds the user id and the time it was issued, signed with
// an HMAC of SESSION_SECRET, so it cannot be forged or changed.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
export const SESSION_COOKIE = "sid";
export const SESSION_DAYS = 30;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** True when `password` matches a hash from hashPassword. Accounts with the hash "!" cannot log in. */
export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored).split("$");
  const expected = Buffer.from(hash ?? "", "base64url");
  if (kind !== "scrypt" || !salt || expected.length !== KEYLEN) return false;
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), KEYLEN);
  return timingSafeEqual(actual, expected);
}

/** Checks a password against a throwaway hash, so a wrong username takes as long as a wrong password. */
const DUMMY = hashPassword("not a real password");
export async function wasteTime(password) {
  await verifyPassword(password, await DUMMY);
  return false;
}

const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest("base64url");

export function sessionToken(userId, secret, now = Date.now()) {
  const payload = `${userId}.${Math.floor(now / 1000)}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** The user id in a session cookie, or null when it is missing, tampered with or older than 30 days. */
export function readSession(token, secret, now = Date.now()) {
  const m = /^([\w-]{1,36})\.(\d{1,12})\.([\w-]{43})$/.exec(typeof token === "string" ? token : "");
  if (!m) return null;
  const expected = Buffer.from(sign(`${m[1]}.${m[2]}`, secret));
  if (!timingSafeEqual(Buffer.from(m[3]), expected)) return null;
  if (now / 1000 - Number(m[2]) > SESSION_DAYS * 86400) return null;
  return m[1];
}

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    try {
      cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // A badly encoded cookie is ignored.
    }
  }
  return cookies;
}

/** Counts failed logins per key (IP address + username): after `max` failures, wait `windowMs`. */
export function loginLimiter({ max = 10, windowMs = 15 * 60_000 } = {}) {
  const failures = new Map();
  return {
    /** Minutes left to wait, or 0. */
    wait(key, now = Date.now()) {
      const f = failures.get(key);
      if (!f || now > f.until) return 0;
      return f.count >= max ? Math.ceil((f.until - now) / 60_000) : 0;
    },
    fail(key, now = Date.now()) {
      if (failures.size > 10_000) for (const [k, f] of failures) if (now > f.until) failures.delete(k);
      const f = failures.get(key);
      if (!f || now > f.until) failures.set(key, { count: 1, until: now + windowMs });
      else f.count++;
    },
    clear(key) {
      failures.delete(key);
    },
  };
}
