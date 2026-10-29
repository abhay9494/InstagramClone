// MySQL storage. Every value goes through a ? placeholder (never into the SQL text),
// so input like  "); DROP TABLE users; --  is stored as plain text.
// Same interface and results as store/memory.mjs (test/store.test.mjs checks both).
import mysql from "mysql2/promise";
import { DAY, HOUR, tagPattern, toCursor } from "./shared.mjs";

const ID = "CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL";
const ref = (col, table, onDelete = "CASCADE") => `FOREIGN KEY (${col}) REFERENCES ${table}(id) ON DELETE ${onDelete}`;

/** Tables, created if missing. Deleting a user or post removes everything that belongs to it. */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id ${ID} PRIMARY KEY,
    username VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    name VARCHAR(60) NOT NULL DEFAULT '',
    bio VARCHAR(150) NOT NULL DEFAULT '',
    avatar VARCHAR(500) NOT NULL DEFAULT '',
    password_hash VARCHAR(200) NOT NULL,
    created_at DATETIME(3) NOT NULL
  ) DEFAULT CHARSET = utf8mb4`,
  `CREATE TABLE IF NOT EXISTS posts (
    id ${ID} PRIMARY KEY,
    user_id ${ID},
    kind VARCHAR(10) NOT NULL DEFAULT 'photo',
    image VARCHAR(500) NOT NULL,
    video VARCHAR(500) NOT NULL DEFAULT '',
    music VARCHAR(40) NOT NULL DEFAULT '',
    caption TEXT NOT NULL,
    alt VARCHAR(300) NOT NULL DEFAULT '',
    filter VARCHAR(20) NOT NULL DEFAULT 'normal',
    aspect VARCHAR(10) NOT NULL DEFAULT 'square',
    views INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    INDEX posts_by_user (user_id, created_at),
    INDEX posts_by_time (created_at),
    INDEX posts_by_kind (kind, created_at),
    INDEX posts_by_music (music),
    ${ref("user_id", "users")}
  ) DEFAULT CHARSET = utf8mb4`,
  `CREATE TABLE IF NOT EXISTS likes (
    post_id ${ID},
    user_id ${ID},
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (post_id, user_id),
    INDEX likes_by_user (user_id),
    ${ref("post_id", "posts")},
    ${ref("user_id", "users")}
  )`,
  `CREATE TABLE IF NOT EXISTS saves (
    user_id ${ID},
    post_id ${ID},
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (user_id, post_id),
    ${ref("post_id", "posts")},
    ${ref("user_id", "users")}
  )`,
  `CREATE TABLE IF NOT EXISTS reposts (
    post_id ${ID},
    user_id ${ID},
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (post_id, user_id),
    INDEX reposts_by_user (user_id, created_at),
    ${ref("post_id", "posts")},
    ${ref("user_id", "users")}
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id ${ID} PRIMARY KEY,
    post_id ${ID},
    user_id ${ID},
    body VARCHAR(2200) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX comments_by_post (post_id, created_at),
    ${ref("post_id", "posts")},
    ${ref("user_id", "users")}
  ) DEFAULT CHARSET = utf8mb4`,
  `CREATE TABLE IF NOT EXISTS follows (
    follower_id ${ID},
    followee_id ${ID},
    created_at DATETIME(3) NOT NULL,
    PRIMARY KEY (follower_id, followee_id),
    INDEX follows_by_followee (followee_id),
    ${ref("follower_id", "users")},
    ${ref("followee_id", "users")}
  )`,
  `CREATE TABLE IF NOT EXISTS stories (
    id ${ID} PRIMARY KEY,
    user_id ${ID},
    image VARCHAR(500) NOT NULL,
    music VARCHAR(40) NOT NULL DEFAULT '',
    created_at DATETIME(3) NOT NULL,
    INDEX stories_by_user (user_id, created_at),
    ${ref("user_id", "users")}
  )`,
  `CREATE TABLE IF NOT EXISTS story_views (
    story_id ${ID},
    user_id ${ID},
    PRIMARY KEY (story_id, user_id),
    ${ref("story_id", "stories")},
    ${ref("user_id", "users")}
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id ${ID} PRIMARY KEY,
    sender_id ${ID},
    recipient_id ${ID},
    body VARCHAR(2200) NOT NULL DEFAULT '',
    post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at DATETIME(3) NOT NULL,
    read_at DATETIME(3) NULL,
    INDEX messages_by_pair (sender_id, recipient_id, created_at),
    INDEX messages_unread (recipient_id, read_at),
    ${ref("sender_id", "users")},
    ${ref("recipient_id", "users")},
    ${ref("post_id", "posts", "SET NULL")}
  ) DEFAULT CHARSET = utf8mb4`,
];
export const TABLES = ["messages", "story_views", "stories", "follows", "comments", "reposts", "saves", "likes", "posts", "users"];

/** Columns added after the first release of these tables, so older databases are upgraded in place. */
const ADDED_COLUMNS = [
  ["posts", "kind", "VARCHAR(10) NOT NULL DEFAULT 'photo' AFTER user_id"],
  ["posts", "video", "VARCHAR(500) NOT NULL DEFAULT '' AFTER image"],
  ["posts", "music", "VARCHAR(40) NOT NULL DEFAULT '' AFTER video"],
  ["posts", "views", "INT UNSIGNED NOT NULL DEFAULT 0 AFTER aspect"],
  ["stories", "music", "VARCHAR(40) NOT NULL DEFAULT '' AFTER image"],
];

/** Connection settings from the environment (.env); see .env.example. */
export function dbConfig(env = process.env) {
  const database = env.DB_NAME || "insta_post";
  if (!/^\w+$/.test(database)) throw new Error("DB_NAME may only contain letters, digits and _");
  if (!env.DB_PASSWORD) console.warn("DB_PASSWORD is not set — copy .env.example to .env and fill it in.");
  return {
    host: env.DB_HOST || "localhost",
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || "root",
    password: env.DB_PASSWORD || "",
    database,
  };
}

async function createTables(pool) {
  for (const sql of SCHEMA) await pool.query(sql);
  const [cols] = await pool.query("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()");
  const have = new Set(cols.map((r) => `${r.t}.${r.c}`));
  for (const [table, column, definition] of ADDED_COLUMNS) {
    if (!have.has(`${table}.${column}`)) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Creates the database and tables (if needed) and returns a connection pool. Times are stored in UTC. */
export async function connect(config = dbConfig()) {
  const { database, ...server } = config;
  const admin = await mysql.createConnection(server);
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
  await admin.end();
  const pool = mysql.createPool({ ...config, connectionLimit: 10, charset: "utf8mb4", timezone: "Z" });
  await createTables(pool);
  return pool;
}

/** Drops the app's tables and creates them again, empty (used by `npm run seed -- --reset`). */
export async function resetTables(pool) {
  for (const t of TABLES) await pool.query(`DROP TABLE IF EXISTS ${t}`);
  await createTables(pool);
}

const author = (r, prefix = "") => ({ id: r[`${prefix}user_id`], username: r.username, name: r.name, avatar: r.avatar });
const like = (s) => s.replace(/[\\%_]/g, "\\$&");
const isUsernameLike = (s) => /^[a-z0-9._]+$/.test(s);

// One post as the pages show it: author, counts, and whether the viewer liked, saved or reposted it.
// `liked_by` is the first (alphabetical) account the viewer follows that liked the post.
const POST = `p.id, p.kind, p.image, p.video, p.music, p.caption, p.alt, p.filter, p.aspect, p.views, p.created_at,
  u.id AS user_id, u.username, u.name, u.avatar,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id) AS repost_count,
  EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
  EXISTS (SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = ?) AS saved,
  EXISTS (SELECT 1 FROM reposts r WHERE r.post_id = p.id AND r.user_id = ?) AS reposted,
  (SELECT MIN(lu.username) FROM likes l
     JOIN follows f ON f.followee_id = l.user_id AND f.follower_id = ?
     JOIN users lu ON lu.id = l.user_id
   WHERE l.post_id = p.id) AS liked_by`;
const FROM_POSTS = "FROM posts p JOIN users u ON u.id = p.user_id";
const viewerParams = (viewerId) => [viewerId, viewerId, viewerId, viewerId];
/** The ranking from shared.rank, in SQL. The divisor is a DOUBLE literal (…e0) so MySQL does floating-point maths like JavaScript. */
const RANK = `(x.like_count + 2 * x.comment_count + 1)
  / POW(GREATEST(TIMESTAMPDIFF(MICROSECOND, x.created_at, ?), 0) / ${HOUR * 1000}e0 + 2, 1.5) DESC, x.id DESC`;

const toPost = (r) => ({
  id: r.id, kind: r.kind, image: r.image, video: r.video, music: r.music,
  caption: r.caption, alt: r.alt, filter: r.filter, aspect: r.aspect, views: Number(r.views),
  created_at: r.created_at,
  like_count: Number(r.like_count),
  comment_count: Number(r.comment_count),
  repost_count: Number(r.repost_count),
  liked: Boolean(r.liked),
  saved: Boolean(r.saved),
  reposted: Boolean(r.reposted),
  liked_by: r.liked_by ?? null,
  user: author(r),
  ...("feed_at" in r && { feed_at: r.feed_at, reposted_by: r.reposted_by ?? null }),
});

export function mysqlStore(pool) {
  const rows = async (sql, params) => (await pool.query(sql, params))[0];
  // mysql2 rows have no prototype; copy them into plain objects like the in-memory store returns.
  const one = async (sql, params) => {
    const row = (await rows(sql, params))[0];
    return row ? { ...row } : null;
  };
  const posts = async (sql, params) => (await rows(sql, params)).map(toPost);
  const count = async (sql, params) => Number((await one(sql, params)).n);

  return {
    kind: "mysql",

    // ---- Accounts ----------------------------------------------------------
    async createUser({ id, username, name = "", bio = "", avatar = "", passwordHash, createdAt = new Date() }) {
      try {
        await pool.query("INSERT INTO users (id, username, name, bio, avatar, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [id, username, name, bio, avatar, passwordHash, createdAt]);
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") throw Object.assign(new Error("Username taken"), { code: "TAKEN" });
        throw err;
      }
    },
    async userById(id) {
      return one("SELECT id, username, name, bio, avatar, created_at FROM users WHERE id = ?", [id]);
    },
    async userByUsername(username) {
      return one("SELECT id, username, name, bio, avatar, created_at FROM users WHERE username = ?", [username]);
    },
    async credentials(username) {
      const r = await one("SELECT id, password_hash FROM users WHERE username = ?", [username]);
      return r ? { id: r.id, passwordHash: r.password_hash } : null;
    },
    async updateUser(id, fields) {
      const cols = ["name", "bio", "avatar"].filter((c) => c in fields);
      if (!cols.length) return;
      await pool.query(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
    },
    async searchUsers(q, limit = 20) {
      const needle = q.toLowerCase();
      // Usernames are ASCII only, so a search with other characters can only match names.
      const byUsername = isUsernameLike(needle);
      return (await rows(
        `SELECT u.id AS user_id, u.username, u.name, u.avatar FROM users u
         WHERE ${byUsername ? "u.username LIKE ? OR" : ""} u.name LIKE ?
         ORDER BY ${byUsername ? "(u.username = ?) DESC," : ""}
           (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC, u.username
         LIMIT ?`,
        byUsername ? [`${like(needle)}%`, `%${like(q)}%`, needle, limit] : [`%${like(q)}%`, limit],
      )).map((r) => author(r));
    },
    async suggestions(viewerId, limit = 5) {
      return (await rows(
        `SELECT u.id AS user_id, u.username, u.name, u.avatar,
           (SELECT MIN(fu.username) FROM follows f JOIN users fu ON fu.id = f.follower_id
            WHERE f.followee_id = u.id AND f.follower_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)) AS followed_by
         FROM users u
         WHERE u.id <> ? AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?)
         ORDER BY (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) DESC, u.username
         LIMIT ?`,
        [viewerId, viewerId, viewerId, limit],
      )).map((r) => ({ ...author(r), followed_by: r.followed_by ?? null }));
    },
    async profileCounts(userId) {
      const r = await one(
        `SELECT (SELECT COUNT(*) FROM posts WHERE user_id = ?) AS posts,
                (SELECT COUNT(*) FROM follows WHERE followee_id = ?) AS followers,
                (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following`,
        [userId, userId, userId],
      );
      return { posts: Number(r.posts), followers: Number(r.followers), following: Number(r.following) };
    },
    /** Accounts the viewer follows that also follow `userId` (for "Followed by a, b + 3 more"). */
    async mutuals(viewerId, userId, limit = 2) {
      const names = (await rows(
        `SELECT fu.username FROM follows f JOIN users fu ON fu.id = f.follower_id
         WHERE f.followee_id = ? AND f.follower_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
         ORDER BY fu.username`,
        [userId, viewerId],
      )).map((r) => r.username);
      return { names: names.slice(0, limit), total: names.length };
    },

    // ---- Following -----------------------------------------------------------
    async follow(followerId, followeeId, at = new Date()) {
      if (followerId === followeeId) return;
      await pool.query("INSERT IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [followerId, followeeId, at]);
    },
    async unfollow(followerId, followeeId) {
      await pool.query("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", [followerId, followeeId]);
    },
    async isFollowing(followerId, followeeId) {
      return Boolean(await one("SELECT 1 AS yes FROM follows WHERE follower_id = ? AND followee_id = ?", [followerId, followeeId]));
    },
    async followers(userId, viewerId) {
      return (await rows(
        `SELECT u.id AS user_id, u.username, u.name, u.avatar,
           EXISTS (SELECT 1 FROM follows v WHERE v.follower_id = ? AND v.followee_id = u.id) AS following
         FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? ORDER BY u.username`,
        [viewerId, userId],
      )).map((r) => ({ ...author(r), following: Boolean(r.following) }));
    },
    async following(userId, viewerId) {
      return (await rows(
        `SELECT u.id AS user_id, u.username, u.name, u.avatar,
           EXISTS (SELECT 1 FROM follows v WHERE v.follower_id = ? AND v.followee_id = u.id) AS following
         FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY u.username`,
        [viewerId, userId],
      )).map((r) => ({ ...author(r), following: Boolean(r.following) }));
    },

    // ---- Posts and reels -----------------------------------------------------------
    async createPost({ id, userId, kind = "photo", image, video = "", music = "", caption = "", alt = "", filter = "normal", aspect = "square", views = 0, createdAt = new Date() }) {
      await pool.query(
        "INSERT INTO posts (id, user_id, kind, image, video, music, caption, alt, filter, aspect, views, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, userId, kind, image, video, music, caption, alt, filter, aspect, views, createdAt],
      );
    },
    async getPost(id, viewerId = "") {
      return (await posts(`SELECT ${POST} ${FROM_POSTS} WHERE p.id = ?`, [...viewerParams(viewerId), id]))[0] ?? null;
    },
    async updatePost(id, fields) {
      const cols = ["caption", "alt", "filter", "aspect", "image", "music"].filter((c) => c in fields);
      if (!cols.length) return;
      await pool.query(`UPDATE posts SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
    },
    async removePost(id) {
      const [result] = await pool.query("DELETE FROM posts WHERE id = ?", [id]);
      return result.affectedRows > 0;
    },
    async addView(id) {
      await pool.query("UPDATE posts SET views = views + 1 WHERE id = ?", [id]);
    },
    /**
     * The home feed: posts by the viewer and the accounts they follow, plus posts those accounts
     * reposted (marked reposted_by; reposts of the viewer's own posts belong in Activity, not here),
     * newest first. A post shows once, at its latest appearance (at the same moment, the original
     * beats a repost; see shared.laterEvent).
     */
    async feed(viewerId, { limit, before = null }) {
      const list = await posts(
        `SELECT ${POST}, e.at AS feed_at, e.reposter AS reposted_by
         FROM (
           SELECT post_id, at, reposter FROM (
             SELECT ev.*, ROW_NUMBER() OVER (PARTITION BY ev.post_id ORDER BY ev.at DESC, ev.reposter) AS n FROM (
               SELECT p.id AS post_id, p.created_at AS at, NULL AS reposter FROM posts p
                 WHERE p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
               UNION ALL
               SELECT r.post_id, r.created_at, ru.username FROM reposts r JOIN users ru ON ru.id = r.user_id
                 JOIN posts rp ON rp.id = r.post_id AND rp.user_id <> ?
                 WHERE r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
             ) ev
           ) ranked WHERE n = 1
         ) e
         JOIN posts p ON p.id = e.post_id JOIN users u ON u.id = p.user_id
         ${before ? "WHERE e.at < ? OR (e.at = ? AND p.id < ?)" : ""}
         ORDER BY e.at DESC, p.id DESC LIMIT ?`,
        [...viewerParams(viewerId), viewerId, viewerId, viewerId, viewerId, ...(before ? [before.t, before.t, before.id] : []), limit + 1],
      );
      const results = list.slice(0, limit);
      return { posts: results, next: list.length > limit ? toCursor(results.at(-1)) : null };
    },
    /** Every post except the viewer's own, most liked and commented first, with newer posts ranked up (see shared.rank). */
    async explore(viewerId, { limit, offset = 0, now = new Date() }) {
      return posts(`SELECT * FROM (SELECT ${POST} ${FROM_POSTS} WHERE p.user_id <> ?) x ORDER BY ${RANK} LIMIT ? OFFSET ?`,
        [...viewerParams(viewerId), viewerId, now, limit, offset]);
    },
    /** Reels from everyone but the viewer, ranked like Explore. */
    async reels(viewerId, { limit, offset = 0, now = new Date() }) {
      return posts(`SELECT * FROM (SELECT ${POST} ${FROM_POSTS} WHERE p.kind = 'reel' AND p.user_id <> ?) x ORDER BY ${RANK} LIMIT ? OFFSET ?`,
        [...viewerParams(viewerId), viewerId, now, limit, offset]);
    },
    /** A person's posts, newest first; `kind: "reel"` for just their reels. */
    async userPosts(userId, viewerId, { limit, offset = 0, kind = null }) {
      return posts(`SELECT ${POST} ${FROM_POSTS} WHERE p.user_id = ? ${kind ? "AND p.kind = ?" : ""} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
        [...viewerParams(viewerId), userId, ...(kind ? [kind] : []), limit, offset]);
    },
    /** The viewer's saved posts, most recently saved first. */
    async savedPosts(userId, { limit, offset = 0 }) {
      return posts(
        `SELECT ${POST} ${FROM_POSTS} JOIN saves sv ON sv.post_id = p.id AND sv.user_id = ?
         ORDER BY sv.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
        [...viewerParams(userId), userId, limit, offset],
      );
    },
    /** Posts a person reposted, most recent repost first. */
    async repostsBy(userId, viewerId, { limit, offset = 0 }) {
      return posts(
        `SELECT ${POST} ${FROM_POSTS} JOIN reposts rp ON rp.post_id = p.id AND rp.user_id = ?
         ORDER BY rp.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
        [...viewerParams(viewerId), userId, limit, offset],
      );
    },
    async tagPosts(tag, viewerId, { limit, offset = 0 }) {
      return posts(`SELECT ${POST} ${FROM_POSTS} WHERE REGEXP_LIKE(p.caption, ?, 'i') ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
        [...viewerParams(viewerId), tagPattern(tag).sql, limit, offset]);
    },
    async tagCount(tag) {
      return count("SELECT COUNT(*) AS n FROM posts WHERE REGEXP_LIKE(caption, ?, 'i')", [tagPattern(tag).sql]);
    },
    /** Posts and reels that use a music track, newest first. */
    async audioPosts(trackId, viewerId, { limit, offset = 0 }) {
      return posts(`SELECT ${POST} ${FROM_POSTS} WHERE p.music = ? ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
        [...viewerParams(viewerId), trackId, limit, offset]);
    },
    async audioCount(trackId) {
      return count("SELECT COUNT(*) AS n FROM posts WHERE music = ?", [trackId]);
    },

    // ---- Likes, saves and reposts ---------------------------------------------
    async like(userId, postId, at = new Date()) {
      await pool.query("INSERT IGNORE INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)", [postId, userId, at]);
      return count("SELECT COUNT(*) AS n FROM likes WHERE post_id = ?", [postId]);
    },
    async unlike(userId, postId) {
      await pool.query("DELETE FROM likes WHERE post_id = ? AND user_id = ?", [postId, userId]);
      return count("SELECT COUNT(*) AS n FROM likes WHERE post_id = ?", [postId]);
    },
    async save(userId, postId, at = new Date()) {
      await pool.query("INSERT IGNORE INTO saves (user_id, post_id, created_at) VALUES (?, ?, ?)", [userId, postId, at]);
    },
    async unsave(userId, postId) {
      await pool.query("DELETE FROM saves WHERE user_id = ? AND post_id = ?", [userId, postId]);
    },
    async repost(userId, postId, at = new Date()) {
      await pool.query("INSERT IGNORE INTO reposts (post_id, user_id, created_at) VALUES (?, ?, ?)", [postId, userId, at]);
      return count("SELECT COUNT(*) AS n FROM reposts WHERE post_id = ?", [postId]);
    },
    async unrepost(userId, postId) {
      await pool.query("DELETE FROM reposts WHERE post_id = ? AND user_id = ?", [postId, userId]);
      return count("SELECT COUNT(*) AS n FROM reposts WHERE post_id = ?", [postId]);
    },

    // ---- Comments -------------------------------------------------------------
    async addComment({ id, postId, userId, body, createdAt = new Date() }) {
      await pool.query("INSERT INTO comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", [id, postId, userId, body, createdAt]);
    },
    async getComment(id) {
      return one("SELECT id, post_id, user_id, body, created_at FROM comments WHERE id = ?", [id]);
    },
    /** A post's comments, oldest first. */
    async comments(postId, { limit = 200 } = {}) {
      return (await rows(
        `SELECT c.id, c.post_id, c.body, c.created_at, u.id AS user_id, u.username, u.name, u.avatar
         FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at, c.id LIMIT ?`,
        [postId, limit],
      )).map((r) => ({ id: r.id, post_id: r.post_id, body: r.body, created_at: r.created_at, user: author(r) }));
    },
    async removeComment(id) {
      const [result] = await pool.query("DELETE FROM comments WHERE id = ?", [id]);
      return result.affectedRows > 0;
    },

    // ---- Stories (visible for 24 hours) -----------------------------------
    async createStory({ id, userId, image, music = "", createdAt = new Date() }) {
      await pool.query("INSERT INTO stories (id, user_id, image, music, created_at) VALUES (?, ?, ?, ?, ?)", [id, userId, image, music, createdAt]);
    },
    /** One entry per account (the viewer and who they follow) with a story from the last 24 hours. */
    async storyTray(viewerId, now = new Date()) {
      return (await rows(
        `SELECT u.id AS user_id, u.username, u.name, u.avatar, MAX(s.created_at) AS latest,
           SUM(NOT EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.user_id = ?)) AS unseen
         FROM stories s JOIN users u ON u.id = s.user_id
         WHERE s.created_at > ? AND (s.user_id = ? OR s.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))
         GROUP BY u.id, u.username, u.name, u.avatar`,
        [viewerId, new Date(now - DAY), viewerId, viewerId],
      )).map((r) => ({ user: author(r), latest: r.latest, unseen: Number(r.unseen) }));
    },
    /** A user's stories from the last 24 hours, oldest first. */
    async stories(userId, viewerId, now = new Date()) {
      return (await rows(
        `SELECT s.id, s.image, s.music, s.created_at,
           EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.user_id = ?) AS seen
         FROM stories s WHERE s.user_id = ? AND s.created_at > ? ORDER BY s.created_at, s.id`,
        [viewerId, userId, new Date(now - DAY)],
      )).map((r) => ({ id: r.id, image: r.image, music: r.music, created_at: r.created_at, seen: Boolean(r.seen) }));
    },
    async markSeen(viewerId, storyId) {
      await pool.query("INSERT IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)", [storyId, viewerId]);
    },

    // ---- Messages (one-to-one) ------------------------------------------------
    async sendMessage({ id, senderId, recipientId, body = "", postId = null, createdAt = new Date() }) {
      await pool.query("INSERT INTO messages (id, sender_id, recipient_id, body, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, senderId, recipientId, body, postId, createdAt]);
    },
    /** The last `limit` messages between two people, oldest first. */
    async thread(meId, otherId, { limit = 60 } = {}) {
      return (await rows(
        `SELECT m.id, m.body, m.created_at, m.read_at, m.sender_id = ? AS mine,
           p.id AS post_id, p.kind AS post_kind, p.image AS post_image, p.filter AS post_filter, p.caption AS post_caption,
           pu.username AS post_username, pu.avatar AS post_avatar
         FROM messages m LEFT JOIN posts p ON p.id = m.post_id LEFT JOIN users pu ON pu.id = p.user_id
         WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
         ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
        [meId, meId, otherId, otherId, meId, limit],
      )).reverse().map((r) => ({
        id: r.id, body: r.body, created_at: r.created_at, read_at: r.read_at ?? null, mine: Boolean(r.mine),
        post: r.post_id
          ? { id: r.post_id, kind: r.post_kind, image: r.post_image, filter: r.post_filter, caption: r.post_caption, user: { username: r.post_username, avatar: r.post_avatar } }
          : null,
      }));
    },
    /** One row per conversation, most recent first, with the last message and how many are unread. */
    async inbox(meId) {
      return (await rows(
        `SELECT t.body, t.post_id, t.sender_id, t.created_at, u.id AS user_id, u.username, u.name, u.avatar,
           (SELECT COUNT(*) FROM messages x WHERE x.sender_id = t.other_id AND x.recipient_id = ? AND x.read_at IS NULL) AS unread
         FROM (
           SELECT m.*, IF(m.sender_id = ?, m.recipient_id, m.sender_id) AS other_id,
             ROW_NUMBER() OVER (PARTITION BY IF(m.sender_id = ?, m.recipient_id, m.sender_id) ORDER BY m.created_at DESC, m.id DESC) AS n
           FROM messages m WHERE m.sender_id = ? OR m.recipient_id = ?
         ) t JOIN users u ON u.id = t.other_id
         WHERE t.n = 1
         ORDER BY t.created_at DESC, t.id DESC`,
        [meId, meId, meId, meId, meId],
      )).map((r) => ({
        user: author(r),
        last: { body: r.body, shared: Boolean(r.post_id), mine: r.sender_id === meId, created_at: r.created_at },
        unread: Number(r.unread),
      }));
    },
    /** Marks what `otherId` sent to `meId` as read; returns how many were unread. */
    async markRead(meId, otherId, at = new Date()) {
      const [result] = await pool.query("UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL", [at, otherId, meId]);
      return result.affectedRows;
    },
    /** How many people have sent the user messages they haven't read. */
    async unreadThreads(meId) {
      return count("SELECT COUNT(DISTINCT sender_id) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL", [meId]);
    },
    /** People to send a post to: recent chats first, then everyone the user follows. */
    async shareTargets(meId, limit = 20) {
      const recent = (await this.inbox(meId)).map((c) => c.user);
      const followed = (await rows(
        "SELECT u.id AS user_id, u.username, u.name, u.avatar FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY u.username",
        [meId],
      )).map((r) => author(r));
      const seenIds = new Set();
      return [...recent, ...followed].filter((u) => !seenIds.has(u.id) && seenIds.add(u.id)).slice(0, limit);
    },

    // ---- Activity -------------------------------------------------------------
    /** Likes, comments and reposts of the user's posts, and new followers, newest first. */
    async activity(userId, { limit = 50 } = {}) {
      return (await rows(
        `SELECT a.type, a.body, a.created_at, u.id AS user_id, u.username, u.name, u.avatar,
           p.id AS post_id, p.image AS post_image, p.filter AS post_filter,
           EXISTS (SELECT 1 FROM follows v WHERE v.follower_id = ? AND v.followee_id = u.id) AS following
         FROM (
           SELECT 'like' AS type, l.user_id AS actor_id, l.post_id, NULL AS body, l.created_at
             FROM likes l JOIN posts mp ON mp.id = l.post_id WHERE mp.user_id = ? AND l.user_id <> ?
           UNION ALL
           SELECT 'repost', r.user_id, r.post_id, NULL, r.created_at
             FROM reposts r JOIN posts mp ON mp.id = r.post_id WHERE mp.user_id = ? AND r.user_id <> ?
           UNION ALL
           SELECT 'comment', c.user_id, c.post_id, c.body, c.created_at
             FROM comments c JOIN posts mp ON mp.id = c.post_id WHERE mp.user_id = ? AND c.user_id <> ?
           UNION ALL
           SELECT 'follow', f.follower_id, NULL, NULL, f.created_at FROM follows f WHERE f.followee_id = ?
         ) a
         JOIN users u ON u.id = a.actor_id
         LEFT JOIN posts p ON p.id = a.post_id
         ORDER BY a.created_at DESC, a.type
         LIMIT ?`,
        [userId, userId, userId, userId, userId, userId, userId, userId, limit],
      )).map((r) => ({
        type: r.type, body: r.body, created_at: r.created_at,
        user: author(r),
        post: r.post_id ? { id: r.post_id, image: r.post_image, filter: r.post_filter } : null,
        following: Boolean(r.following),
      }));
    },

    /** Inserts a whole data set in a few statements (the seed script); `data` holds arrays of rows per table. */
    async bulk(data) {
      const insert = async (table, cols, list = []) => {
        for (let i = 0; i < list.length; i += 500) {
          await pool.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ?`, [list.slice(i, i + 500).map((r) => cols.map((c) => r[c] ?? null))]);
        }
      };
      await insert("users", ["id", "username", "name", "bio", "avatar", "password_hash", "created_at"], data.users);
      await insert("posts", ["id", "user_id", "kind", "image", "video", "music", "caption", "alt", "filter", "aspect", "views", "created_at"],
        data.posts.map((p) => ({ kind: "photo", video: "", music: "", views: 0, ...p })));
      await insert("likes", ["post_id", "user_id", "created_at"], data.likes);
      await insert("saves", ["user_id", "post_id", "created_at"], data.saves);
      await insert("reposts", ["post_id", "user_id", "created_at"], data.reposts);
      await insert("comments", ["id", "post_id", "user_id", "body", "created_at"], data.comments);
      await insert("follows", ["follower_id", "followee_id", "created_at"], data.follows);
      await insert("stories", ["id", "user_id", "image", "music", "created_at"], data.stories.map((s) => ({ music: "", ...s })));
      await insert("messages", ["id", "sender_id", "recipient_id", "body", "post_id", "created_at", "read_at"], data.messages);
    },
  };
}
