// All the app's data kept in memory: used by the tests and by `npm run demo` (no MySQL needed).
// It has the same interface and gives the same results as store/mysql.mjs —
// test/store.test.mjs runs one set of checks against both.
import { DAY, rank, newestFirst, tagPattern, toCursor, laterEvent } from "./shared.mjs";

export function memoryStore() {
  const users = new Map(); // id → user row (with passwordHash)
  const posts = new Map(); // id → post row
  const likes = new Map(); // postId → Map(userId → time)
  const saves = new Map(); // userId → Map(postId → time)
  const reposts = new Map(); // postId → Map(userId → time)
  const comments = new Map(); // id → comment row
  const follows = new Map(); // followerId → Map(followeeId → time)
  const stories = new Map(); // id → story row
  const seen = new Set(); // `${storyId} ${userId}`
  const messages = new Map(); // id → message row

  const author = (u) => ({ id: u.id, username: u.username, name: u.name, avatar: u.avatar });
  const publicUser = ({ passwordHash, ...u }) => u;
  const followeesOf = (id) => new Set(follows.get(id)?.keys() ?? []);
  const followerIds = (id) => [...follows].filter(([, m]) => m.has(id)).map(([f]) => f);
  const isFollowing = (a, b) => Boolean(follows.get(a)?.has(b));
  const likers = (postId) => likes.get(postId) ?? new Map();
  const reposters = (postId) => reposts.get(postId) ?? new Map();
  const commentsOn = (postId) => [...comments.values()].filter((c) => c.post_id === postId);
  const byUsername = (a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0);
  const byIdDesc = (a, b) => (b.id > a.id ? 1 : b.id < a.id ? -1 : 0);

  function view(p, viewerId, extra = {}) {
    const liked = likers(p.id);
    const followed = followeesOf(viewerId);
    const likedBy = [...liked.keys()].filter((id) => followed.has(id)).map((id) => users.get(id).username).sort()[0];
    return {
      id: p.id, kind: p.kind, image: p.image, video: p.video, music: p.music,
      caption: p.caption, alt: p.alt, filter: p.filter, aspect: p.aspect, views: p.views,
      created_at: p.created_at,
      like_count: liked.size,
      comment_count: commentsOn(p.id).length,
      repost_count: reposters(p.id).size,
      liked: liked.has(viewerId),
      saved: Boolean(saves.get(viewerId)?.has(p.id)),
      reposted: reposters(p.id).has(viewerId),
      liked_by: likedBy ?? null,
      user: author(users.get(p.user_id)),
      ...extra,
    };
  }
  const page = (list, { limit, offset = 0 }, viewerId) => list.slice(offset, offset + limit).map((p) => view(p, viewerId));
  const ranked = (list, now) =>
    list
      .map((p) => ({ p, score: rank(likers(p.id).size, commentsOn(p.id).length, p.created_at, now) }))
      .sort((a, b) => b.score - a.score || byIdDesc(a.p, b.p))
      .map((x) => x.p);
  const withFollowFlag = (list, viewerId) => list.map((u) => ({ ...author(u), following: isFollowing(viewerId, u.id) }));
  const between = (m, a, b) => (m.sender_id === a && m.recipient_id === b) || (m.sender_id === b && m.recipient_id === a);
  const sharedPost = (postId) => {
    const p = postId && posts.get(postId);
    if (!p) return null;
    const u = users.get(p.user_id);
    return { id: p.id, kind: p.kind, image: p.image, filter: p.filter, caption: p.caption, user: { username: u.username, avatar: u.avatar } };
  };
  const chats = (meId) => {
    const byOther = new Map();
    for (const m of messages.values()) {
      if (m.sender_id !== meId && m.recipient_id !== meId) continue;
      const other = m.sender_id === meId ? m.recipient_id : m.sender_id;
      const last = byOther.get(other);
      if (!last || m.created_at > last.created_at || (+m.created_at === +last.created_at && m.id > last.id)) byOther.set(other, m);
    }
    return [...byOther].sort(([, a], [, b]) => b.created_at - a.created_at || byIdDesc(a, b));
  };

  return {
    kind: "memory",

    // ---- Accounts ----------------------------------------------------------
    async createUser({ id, username, name = "", bio = "", avatar = "", passwordHash, createdAt = new Date() }) {
      if ([...users.values()].some((u) => u.username === username)) throw Object.assign(new Error("Username taken"), { code: "TAKEN" });
      users.set(id, { id, username, name, bio, avatar, passwordHash, created_at: createdAt });
    },
    async userById(id) {
      const u = users.get(id);
      return u ? publicUser(u) : null;
    },
    async userByUsername(username) {
      const u = [...users.values()].find((x) => x.username === username);
      return u ? publicUser(u) : null;
    },
    async credentials(username) {
      const u = [...users.values()].find((x) => x.username === username);
      return u ? { id: u.id, passwordHash: u.passwordHash } : null;
    },
    async updateUser(id, fields) {
      const u = users.get(id);
      for (const k of ["name", "bio", "avatar"]) if (k in fields) u[k] = fields[k];
    },
    async searchUsers(q, limit = 20) {
      const needle = q.toLowerCase();
      const counts = new Map([...users.keys()].map((id) => [id, followerIds(id).length]));
      return [...users.values()]
        .filter((u) => u.username.startsWith(needle) || u.name.toLowerCase().includes(needle))
        .sort((a, b) => (b.username === needle) - (a.username === needle) || counts.get(b.id) - counts.get(a.id) || byUsername(a, b))
        .slice(0, limit)
        .map(author);
    },
    async suggestions(viewerId, limit = 5) {
      const followed = followeesOf(viewerId);
      const counts = new Map([...users.keys()].map((id) => [id, followerIds(id).length]));
      return [...users.values()]
        .filter((u) => u.id !== viewerId && !followed.has(u.id))
        .sort((a, b) => counts.get(b.id) - counts.get(a.id) || byUsername(a, b))
        .slice(0, limit)
        .map((u) => ({
          ...author(u),
          followed_by: followerIds(u.id).filter((f) => followed.has(f)).map((f) => users.get(f).username).sort()[0] ?? null,
        }));
    },
    async profileCounts(userId) {
      return {
        posts: [...posts.values()].filter((p) => p.user_id === userId).length,
        followers: followerIds(userId).length,
        following: followeesOf(userId).size,
      };
    },
    /** Accounts the viewer follows that also follow `userId` (for "Followed by a, b + 3 more"). */
    async mutuals(viewerId, userId, limit = 2) {
      const followed = followeesOf(viewerId);
      const names = followerIds(userId).filter((f) => followed.has(f)).map((f) => users.get(f).username).sort();
      return { names: names.slice(0, limit), total: names.length };
    },

    // ---- Following -----------------------------------------------------------
    async follow(followerId, followeeId, at = new Date()) {
      if (followerId === followeeId) return;
      if (!follows.has(followerId)) follows.set(followerId, new Map());
      if (!follows.get(followerId).has(followeeId)) follows.get(followerId).set(followeeId, at);
    },
    async unfollow(followerId, followeeId) {
      follows.get(followerId)?.delete(followeeId);
    },
    async isFollowing(followerId, followeeId) {
      return isFollowing(followerId, followeeId);
    },
    async followers(userId, viewerId) {
      return withFollowFlag(followerIds(userId).map((id) => users.get(id)).sort(byUsername), viewerId);
    },
    async following(userId, viewerId) {
      return withFollowFlag([...followeesOf(userId)].map((id) => users.get(id)).sort(byUsername), viewerId);
    },

    // ---- Posts and reels -----------------------------------------------------------
    async createPost({ id, userId, kind = "photo", image, video = "", music = "", caption = "", alt = "", filter = "normal", aspect = "square", views = 0, createdAt = new Date() }) {
      posts.set(id, { id, user_id: userId, kind, image, video, music, caption, alt, filter, aspect, views, created_at: createdAt });
    },
    async getPost(id, viewerId = "") {
      const p = posts.get(id);
      return p ? view(p, viewerId) : null;
    },
    async updatePost(id, fields) {
      const p = posts.get(id);
      for (const k of ["caption", "alt", "filter", "aspect", "image", "music"]) if (k in fields) p[k] = fields[k];
    },
    async removePost(id) {
      if (!posts.delete(id)) return false;
      likes.delete(id);
      reposts.delete(id);
      for (const m of saves.values()) m.delete(id);
      for (const c of commentsOn(id)) comments.delete(c.id);
      for (const m of messages.values()) if (m.post_id === id) m.post_id = null;
      return true;
    },
    async addView(id) {
      const p = posts.get(id);
      if (p) p.views++;
    },
    /**
     * The home feed: posts by the viewer and the accounts they follow, plus posts those accounts
     * reposted (marked reposted_by; reposts of the viewer's own posts belong in Activity, not here),
     * newest first. A post shows once, at its latest appearance.
     */
    async feed(viewerId, { limit, before = null }) {
      const followed = followeesOf(viewerId);
      const events = new Map();
      const consider = (postId, at, reposter) => events.set(postId, laterEvent(events.get(postId), { at, reposter }));
      for (const p of posts.values()) if (p.user_id === viewerId || followed.has(p.user_id)) consider(p.id, p.created_at, null);
      for (const [postId, m] of reposts) {
        if (posts.get(postId).user_id === viewerId) continue;
        for (const [userId, at] of m) if (followed.has(userId)) consider(postId, at, users.get(userId).username);
      }
      const list = [...events]
        .map(([postId, e]) => ({ p: posts.get(postId), ...e }))
        .filter(({ p, at }) => !before || at < before.t || (+at === +before.t && p.id < before.id))
        .sort((a, b) => b.at - a.at || byIdDesc(a.p, b.p));
      const results = list.slice(0, limit).map(({ p, at, reposter }) => view(p, viewerId, { feed_at: at, reposted_by: reposter }));
      return { posts: results, next: list.length > limit ? toCursor(results.at(-1)) : null };
    },
    /** Every post except the viewer's own, most liked and commented first, with newer posts ranked up. */
    async explore(viewerId, { limit, offset = 0, now = new Date() }) {
      return page(ranked([...posts.values()].filter((p) => p.user_id !== viewerId), now), { limit, offset }, viewerId);
    },
    /** Reels from everyone but the viewer, ranked like Explore. */
    async reels(viewerId, { limit, offset = 0, now = new Date() }) {
      return page(ranked([...posts.values()].filter((p) => p.kind === "reel" && p.user_id !== viewerId), now), { limit, offset }, viewerId);
    },
    /** A person's posts, newest first; `kind: "reel"` for just their reels. */
    async userPosts(userId, viewerId, { limit, offset = 0, kind = null }) {
      const list = [...posts.values()].filter((p) => p.user_id === userId && (!kind || p.kind === kind)).sort(newestFirst);
      return page(list, { limit, offset }, viewerId);
    },
    /** The viewer's saved posts, most recently saved first. */
    async savedPosts(userId, { limit, offset = 0 }) {
      const list = [...(saves.get(userId) ?? new Map())]
        .sort(([a, ta], [b, tb]) => tb - ta || (b > a ? 1 : -1))
        .map(([id]) => posts.get(id));
      return page(list, { limit, offset }, userId);
    },
    /** Posts a person reposted, most recent repost first. */
    async repostsBy(userId, viewerId, { limit, offset = 0 }) {
      const list = [...reposts]
        .filter(([, m]) => m.has(userId))
        .map(([postId, m]) => ({ p: posts.get(postId), at: m.get(userId) }))
        .sort((a, b) => b.at - a.at || byIdDesc(a.p, b.p))
        .map((x) => x.p);
      return page(list, { limit, offset }, viewerId);
    },
    async tagPosts(tag, viewerId, { limit, offset = 0 }) {
      const re = new RegExp(tagPattern(tag).js, "iu");
      return page([...posts.values()].filter((p) => re.test(p.caption)).sort(newestFirst), { limit, offset }, viewerId);
    },
    async tagCount(tag) {
      const re = new RegExp(tagPattern(tag).js, "iu");
      return [...posts.values()].filter((p) => re.test(p.caption)).length;
    },
    /** Posts and reels that use a music track, newest first. */
    async audioPosts(trackId, viewerId, { limit, offset = 0 }) {
      return page([...posts.values()].filter((p) => p.music === trackId).sort(newestFirst), { limit, offset }, viewerId);
    },
    async audioCount(trackId) {
      return [...posts.values()].filter((p) => p.music === trackId).length;
    },

    // ---- Likes, saves and reposts ---------------------------------------------
    async like(userId, postId, at = new Date()) {
      if (!likes.has(postId)) likes.set(postId, new Map());
      if (!likes.get(postId).has(userId)) likes.get(postId).set(userId, at);
      return likes.get(postId).size;
    },
    async unlike(userId, postId) {
      likes.get(postId)?.delete(userId);
      return likers(postId).size;
    },
    async save(userId, postId, at = new Date()) {
      if (!saves.has(userId)) saves.set(userId, new Map());
      if (!saves.get(userId).has(postId)) saves.get(userId).set(postId, at);
    },
    async unsave(userId, postId) {
      saves.get(userId)?.delete(postId);
    },
    async repost(userId, postId, at = new Date()) {
      if (!reposts.has(postId)) reposts.set(postId, new Map());
      if (!reposts.get(postId).has(userId)) reposts.get(postId).set(userId, at);
      return reposts.get(postId).size;
    },
    async unrepost(userId, postId) {
      reposts.get(postId)?.delete(userId);
      return reposters(postId).size;
    },

    // ---- Comments -------------------------------------------------------------
    async addComment({ id, postId, userId, body, createdAt = new Date() }) {
      comments.set(id, { id, post_id: postId, user_id: userId, body, created_at: createdAt });
    },
    async getComment(id) {
      const c = comments.get(id);
      return c ? { id: c.id, post_id: c.post_id, user_id: c.user_id, body: c.body, created_at: c.created_at } : null;
    },
    /** A post's comments, oldest first. */
    async comments(postId, { limit = 200 } = {}) {
      return commentsOn(postId)
        .sort((a, b) => a.created_at - b.created_at || (a.id > b.id ? 1 : -1))
        .slice(0, limit)
        .map((c) => ({ id: c.id, post_id: c.post_id, body: c.body, created_at: c.created_at, user: author(users.get(c.user_id)) }));
    },
    async removeComment(id) {
      return comments.delete(id);
    },

    // ---- Stories (visible for 24 hours) -----------------------------------
    async createStory({ id, userId, image, music = "", createdAt = new Date() }) {
      stories.set(id, { id, user_id: userId, image, music, created_at: createdAt });
    },
    /** One entry per account (the viewer and who they follow) with a story from the last 24 hours. */
    async storyTray(viewerId, now = new Date()) {
      const authors = followeesOf(viewerId).add(viewerId);
      const byUser = new Map();
      for (const s of stories.values()) {
        if (!authors.has(s.user_id) || now - s.created_at >= DAY) continue;
        const entry = byUser.get(s.user_id) ?? { user: author(users.get(s.user_id)), latest: s.created_at, unseen: 0 };
        if (s.created_at > entry.latest) entry.latest = s.created_at;
        if (!seen.has(`${s.id} ${viewerId}`)) entry.unseen++;
        byUser.set(s.user_id, entry);
      }
      return [...byUser.values()];
    },
    /** A user's stories from the last 24 hours, oldest first. */
    async stories(userId, viewerId, now = new Date()) {
      return [...stories.values()]
        .filter((s) => s.user_id === userId && now - s.created_at < DAY)
        .sort((a, b) => a.created_at - b.created_at || (a.id > b.id ? 1 : -1))
        .map((s) => ({ id: s.id, image: s.image, music: s.music, created_at: s.created_at, seen: seen.has(`${s.id} ${viewerId}`) }));
    },
    async markSeen(viewerId, storyId) {
      if (stories.has(storyId)) seen.add(`${storyId} ${viewerId}`);
    },

    // ---- Messages (one-to-one) ------------------------------------------------
    async sendMessage({ id, senderId, recipientId, body = "", postId = null, createdAt = new Date() }) {
      messages.set(id, { id, sender_id: senderId, recipient_id: recipientId, body, post_id: postId, created_at: createdAt, read_at: null });
    },
    /** The last `limit` messages between two people, oldest first. */
    async thread(meId, otherId, { limit = 60 } = {}) {
      return [...messages.values()]
        .filter((m) => between(m, meId, otherId))
        .sort((a, b) => b.created_at - a.created_at || byIdDesc(a, b))
        .slice(0, limit)
        .reverse()
        .map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, read_at: m.read_at, mine: m.sender_id === meId, post: sharedPost(m.post_id) }));
    },
    /** One row per conversation, most recent first, with the last message and how many are unread. */
    async inbox(meId) {
      return chats(meId).map(([other, m]) => ({
        user: author(users.get(other)),
        last: { body: m.body, shared: Boolean(m.post_id), mine: m.sender_id === meId, created_at: m.created_at },
        unread: [...messages.values()].filter((x) => x.sender_id === other && x.recipient_id === meId && !x.read_at).length,
      }));
    },
    /** Marks what `otherId` sent to `meId` as read; returns how many were unread. */
    async markRead(meId, otherId, at = new Date()) {
      let n = 0;
      for (const m of messages.values()) {
        if (m.sender_id === otherId && m.recipient_id === meId && !m.read_at) {
          m.read_at = at;
          n++;
        }
      }
      return n;
    },
    /** How many people have sent the user messages they haven't read. */
    async unreadThreads(meId) {
      return new Set([...messages.values()].filter((m) => m.recipient_id === meId && !m.read_at).map((m) => m.sender_id)).size;
    },
    /** People to send a post to: recent chats first, then everyone the user follows. */
    async shareTargets(meId, limit = 20) {
      const recent = chats(meId).map(([other]) => other);
      const followed = [...followeesOf(meId)].map((id) => users.get(id)).sort(byUsername).map((u) => u.id);
      return [...new Set([...recent, ...followed])].slice(0, limit).map((id) => author(users.get(id)));
    },

    // ---- Activity -------------------------------------------------------------
    /** Likes, comments and reposts of the user's posts, and new followers, newest first. */
    async activity(userId, { limit = 50 } = {}) {
      const items = [];
      for (const p of [...posts.values()].filter((x) => x.user_id === userId)) {
        for (const [actor, at] of likers(p.id)) if (actor !== userId) items.push({ type: "like", actor, post: p, body: null, created_at: at });
        for (const [actor, at] of reposters(p.id)) if (actor !== userId) items.push({ type: "repost", actor, post: p, body: null, created_at: at });
        for (const c of commentsOn(p.id)) if (c.user_id !== userId) items.push({ type: "comment", actor: c.user_id, post: p, body: c.body, created_at: c.created_at });
      }
      for (const f of followerIds(userId)) items.push({ type: "follow", actor: f, post: null, body: null, created_at: follows.get(f).get(userId) });
      return items
        .sort((a, b) => b.created_at - a.created_at || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
        .slice(0, limit)
        .map((i) => ({
          type: i.type, body: i.body, created_at: i.created_at,
          user: author(users.get(i.actor)),
          post: i.post ? { id: i.post.id, image: i.post.image, filter: i.post.filter } : null,
          following: isFollowing(userId, i.actor),
        }));
    },

    /** Loads a whole data set (the seed script's rows, with MySQL column names). */
    async bulk(data) {
      const pairs = (map, key, a, b, list) => {
        for (const r of list ?? []) {
          if (!map.has(r[a])) map.set(r[a], new Map());
          map.get(r[a]).set(r[b], r.created_at);
        }
      };
      for (const u of data.users) users.set(u.id, { id: u.id, username: u.username, name: u.name, bio: u.bio, avatar: u.avatar, passwordHash: u.password_hash, created_at: u.created_at });
      for (const p of data.posts) posts.set(p.id, { kind: "photo", video: "", music: "", views: 0, ...p });
      pairs(likes, "likes", "post_id", "user_id", data.likes);
      pairs(saves, "saves", "user_id", "post_id", data.saves);
      pairs(reposts, "reposts", "post_id", "user_id", data.reposts);
      pairs(follows, "follows", "follower_id", "followee_id", data.follows);
      for (const c of data.comments) comments.set(c.id, { ...c });
      for (const s of data.stories) stories.set(s.id, { music: "", ...s });
      for (const m of data.messages ?? []) messages.set(m.id, { read_at: null, post_id: null, ...m });
    },
  };
}
