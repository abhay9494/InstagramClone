// The two stores must behave the same: every check here runs against the in-memory store, and
// against MySQL too when TEST_DB_HOST (or TEST_DB_PORT) is set, e.g.
//   TEST_DB_PORT=3307 TEST_DB_PASSWORD=... npm test
// The MySQL run uses its own database (TEST_DB_NAME, default insta_test) and empties it first.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store/memory.mjs";
import { DAY, HOUR, parseCursor } from "../store/shared.mjs";
import { existsSync } from "node:fs";
import { demoData, DEMO } from "../seed.mjs";
import { TRACKS } from "../lib/music.mjs";

const env = process.env;
const useMysql = Boolean(env.TEST_DB_HOST || env.TEST_DB_PORT);
const NOW = new Date("2026-06-01T12:00:00.000Z");
const at = (hoursAgo) => new Date(+NOW - hoursAgo * HOUR);
const ids = (list) => list.map((x) => x.id);

async function openMysql() {
  const { connect, mysqlStore, resetTables } = await import("../store/mysql.mjs");
  const pool = await connect({
    host: env.TEST_DB_HOST || "127.0.0.1",
    port: Number(env.TEST_DB_PORT) || 3306,
    user: env.TEST_DB_USER || "root",
    password: env.TEST_DB_PASSWORD || "",
    database: env.TEST_DB_NAME || "insta_test",
  });
  return { pool, store: mysqlStore(pool), reset: () => resetTables(pool) };
}

/** A small network: ana follows ben and cleo; ben follows ana; dev follows nobody. */
async function scenario(store) {
  const u = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  const p = (n) => `10000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  const [ana, ben, cleo, dev] = [u(1), u(2), u(3), u(4)];
  for (const [id, username, name] of [[ana, "ana", "Ana Silva"], [ben, "ben.k", "Ben King"], [cleo, "cleo_x", "Cleo Ray"], [dev, "dev", "Dev Ánand"]]) {
    await store.createUser({ id, username, name, bio: `hi from ${username} 👋`, avatar: "", passwordHash: "!", createdAt: at(1000) });
  }
  await store.follow(ana, ben, at(500));
  await store.follow(ana, cleo, at(400));
  await store.follow(ben, ana, at(3));
  await store.follow(cleo, ben, at(300));
  await store.follow(ana, ana, at(1)); // ignored: nobody follows themselves
  const posts = [
    [p(1), ben, "Lake day #travel #summer", 50],
    [p(2), cleo, "Coffee ☕ #coffee", 30],
    [p(3), ana, "My first post #Travel", 20],
    [p(4), dev, "Hidden from ana's feed #travelling", 10],
    [p(5), ben, "Mountains #travel", 5],
    [p(6), cleo, "No tags here", 1],
  ];
  for (const [id, userId, caption, h] of posts) {
    await store.createPost({ id, userId, image: `https://img.test/${id}.jpg`, caption, alt: "", filter: "normal", aspect: "square", music: id === p(1) ? "golden-hour" : "", createdAt: at(h) });
  }
  await store.createPost({ id: p(7), userId: cleo, kind: "reel", image: "/media/reels/reel-01.jpg", video: "/media/reels/reel-01.mp4", music: "night-drive", caption: "Night swim 🌊", aspect: "vertical", views: 120, createdAt: at(3) });
  await store.addView(p(7));
  await store.addView(p(7));
  await store.addView("no-such-post");
  // Reposts: ben and cleo both repost dev's post at the same moment; cleo reposts ben's old post;
  // ana's own repost never shows in her own feed; dev (whom ana doesn't follow) reposts ana's post.
  await store.repost(ben, p(4), at(0.5));
  await store.repost(cleo, p(4), at(0.5));
  await store.repost(cleo, p(1), at(40));
  await store.repost(ana, p(2), at(2));
  await store.repost(dev, p(3), at(1.2));
  await store.repost(dev, p(3), at(1.1)); // reposting twice counts once
  await store.repost(ben, p(3), at(0.2)); // ana follows ben, but her own post isn't put back in her feed
  await store.like(ana, p(1), at(40));
  await store.like(cleo, p(1), at(39));
  await store.like(dev, p(1), at(38));
  await store.like(ben, p(3), at(2));
  await store.like(cleo, p(3), at(1.5));
  await store.like(cleo, p(3), at(1.4)); // a second like by the same person counts once
  await store.save(ana, p(2), at(20));
  await store.save(ana, p(6), at(0.5));
  await store.addComment({ id: p(90), postId: p(3), userId: ben, body: "Welcome! @ana", createdAt: at(1.9) });
  await store.addComment({ id: p(91), postId: p(3), userId: ana, body: "Thanks 🙏", createdAt: at(1.8) });
  await store.addComment({ id: p(92), postId: p(1), userId: dev, body: "Wow", createdAt: at(37) });
  await store.createStory({ id: p(80), userId: ben, image: "https://img.test/s1.jpg", music: "stardust", createdAt: at(5) });
  await store.createStory({ id: p(81), userId: ben, image: "https://img.test/s2.jpg", createdAt: at(4) });
  await store.createStory({ id: p(82), userId: cleo, image: "https://img.test/s3.jpg", createdAt: at(30) }); // expired
  await store.createStory({ id: p(83), userId: cleo, image: "https://img.test/s4.jpg", createdAt: at(2) });
  await store.markSeen(ana, p(83));
  await store.markSeen(ana, "not-a-story");

  const m = (n) => `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  await store.sendMessage({ id: m(1), senderId: ben, recipientId: ana, body: "hi ana", createdAt: at(10) });
  await store.sendMessage({ id: m(2), senderId: ana, recipientId: ben, body: "hey!", createdAt: at(9) });
  await store.sendMessage({ id: m(3), senderId: ben, recipientId: ana, body: "", postId: p(6), createdAt: at(2) });
  await store.sendMessage({ id: m(4), senderId: cleo, recipientId: ana, body: "lunch?", createdAt: at(1) });
  await store.sendMessage({ id: m(5), senderId: dev, recipientId: ben, body: "yo", createdAt: at(0.5) });
  await store.sendMessage({ id: m(6), senderId: ana, recipientId: dev, body: "hello", createdAt: at(0.3) });
  const inboxBefore = await store.inbox(ana);
  const unreadBefore = await store.unreadThreads(ana);
  const threadBefore = await store.thread(ana, ben);
  const lastTwo = await store.thread(ana, ben, { limit: 2 });
  const marked = await store.markRead(ana, ben, at(0.1));
  const markedAgain = await store.markRead(ana, ben, at(0.05));

  const pages = [await store.feed(ana, { limit: 2 })];
  while (pages.at(-1).next) pages.push(await store.feed(ana, { limit: 2, before: parseCursor(pages.at(-1).next) }));
  const page1 = pages[0];
  const tray = (await store.storyTray(ana, NOW)).sort((a, b) => (a.user.username < b.user.username ? -1 : 1));
  return {
    ids: { ana, ben, cleo, dev, p },
    user: await store.userByUsername("ben.k"),
    missingUser: await store.userByUsername("nobody"),
    byId: await store.userById(cleo),
    credentials: await store.credentials("ana"),
    counts: await store.profileCounts(ana),
    benCounts: await store.profileCounts(ben),
    feedPages: pages.map((pg) => ({ ids: ids(pg.posts), more: Boolean(pg.next) })),
    feedPost: page1.posts[0],
    feedLast: pages.at(-1).posts[0],
    feedOriginal: page1.posts[1],
    post: await store.getPost(p(3), ben),
    loggedOutPost: await store.getPost(p(3), ""),
    anaSeesP1: await store.getPost(p(1), ana),
    explore: ids(await store.explore(ana, { limit: 10, now: NOW })),
    exploreAll: ids(await store.explore("", { limit: 3, offset: 1, now: NOW })),
    userPosts: ids(await store.userPosts(ben, ana, { limit: 10 })),
    saved: ids(await store.savedPosts(ana, { limit: 10 })),
    tag: ids(await store.tagPosts("travel", ana, { limit: 10 })),
    tagCount: await store.tagCount("travel"),
    comments: await store.comments(p(3)),
    comment: await store.getComment(p(90)),
    tray,
    benStories: await store.stories(ben, ana, NOW),
    cleoStories: await store.stories(cleo, ana, NOW),
    activity: await store.activity(ana),
    suggestions: await store.suggestions(ana, 5),
    devSuggestions: await store.suggestions(dev, 2),
    search: await store.searchUsers("e", 10),
    searchName: await store.searchUsers("ánand", 10),
    searchExact: ids(await store.searchUsers("dev", 10)),
    mutuals: await store.mutuals(ana, ben),
    followers: await store.followers(ben, ana),
    following: await store.following(ana, ben),
    isFollowing: [await store.isFollowing(ana, ben), await store.isFollowing(ben, cleo)],
    reel: await store.getPost(p(7), ana),
    reels: ids(await store.reels(ana, { limit: 10, now: NOW })),
    cleoReels: ids(await store.userPosts(cleo, ana, { limit: 10, kind: "reel" })),
    cleoPosts: ids(await store.userPosts(cleo, ana, { limit: 10 })),
    repostsByCleo: ids(await store.repostsBy(cleo, ana, { limit: 10 })),
    repostedForBen: await store.getPost(p(4), ben),
    audio: [ids(await store.audioPosts("golden-hour", ana, { limit: 10 })), ids(await store.audioPosts("night-drive", ana, { limit: 10 })), await store.audioCount("golden-hour")],
    inboxBefore, unreadBefore, threadBefore, lastTwo, marked, markedAgain,
    threadAfter: await store.thread(ana, ben),
    unreadAfter: await store.unreadThreads(ana),
    benInbox: await store.inbox(ben),
    shareTargets: (await store.shareTargets(ana, 10)).map((x) => x.username),
  };
}

/** Checks the results are right (not just the same in both stores). */
function checkScenario(r) {
  const { ana, ben, dev, p } = r.ids;
  assert.equal(r.user.name, "Ben King");
  assert.equal(r.user.bio, "hi from ben.k 👋");
  assert.equal(r.user.passwordHash, undefined, "password hashes never leave the store except through credentials()");
  assert.equal(r.missingUser, null);
  assert.equal(r.byId.username, "cleo_x");
  assert.deepEqual(r.credentials, { id: ana, passwordHash: "!" });
  assert.deepEqual(r.counts, { posts: 1, followers: 1, following: 2 });
  assert.deepEqual(r.benCounts, { posts: 2, followers: 2, following: 1 });
  // Feed: own posts and followed accounts' posts, newest first, in pages that don't overlap.
  // Reposts by people ana follows bring posts in (dev's post, via ben and cleo at the same moment: ben
  // comes first alphabetically) or move them up (ben's old post, reposted by cleo).
  assert.deepEqual(r.feedPages, [
    { ids: [p(4), p(6)], more: true },
    { ids: [p(7), p(5)], more: true },
    { ids: [p(3), p(2)], more: true },
    { ids: [p(1)], more: false },
  ]);
  assert.equal(r.feedPost.user.username, "dev");
  assert.equal(r.feedPost.reposted_by, "ben.k");
  assert.deepEqual(r.feedPost.feed_at, at(0.5));
  assert.equal(r.feedOriginal.reposted_by, null);
  assert.equal(r.feedLast.reposted_by, "cleo_x");
  assert.deepEqual(r.feedLast.feed_at, at(40));
  assert.deepEqual(r.post.user, { id: ana, username: "ana", name: "Ana Silva", avatar: "" });
  assert.equal(r.post.like_count, 2);
  assert.equal(r.post.comment_count, 2);
  assert.equal(r.post.liked, true, "ben liked it");
  assert.equal(r.post.saved, false);
  assert.equal(r.post.liked_by, null, "nobody ben follows liked it");
  assert.equal(r.anaSeesP1.liked_by, "cleo_x", "ana follows cleo, who liked it");
  assert.equal(r.anaSeesP1.liked, true);
  assert.equal(r.loggedOutPost.liked, false);
  assert.equal(r.loggedOutPost.liked_by, null);
  // Explore leaves out the viewer's own posts and ranks by engagement over age.
  assert.ok(!r.explore.includes(p(3)));
  assert.equal(r.explore.length, 6);
  assert.equal(r.explore[0], p(6), "a brand-new post outranks old ones with few likes");
  assert.equal(r.exploreAll.length, 3);
  assert.deepEqual(r.userPosts, [p(5), p(1)]);
  assert.deepEqual(r.saved, [p(6), p(2)], "most recently saved first");
  assert.deepEqual(r.tag, [p(5), p(3), p(1)], "#travel matches #Travel but not #travelling");
  assert.equal(r.tagCount, 3);
  assert.deepEqual(r.comments.map((c) => [c.user.username, c.body]), [["ben.k", "Welcome! @ana"], ["ana", "Thanks 🙏"]]);
  assert.deepEqual(r.comment, { id: p(90), post_id: p(3), user_id: ben, body: "Welcome! @ana", created_at: at(1.9) });
  // Stories: 24 hours only; seen ones are counted.
  assert.deepEqual(r.tray.map((t) => [t.user.username, t.unseen]), [["ben.k", 2], ["cleo_x", 0]]);
  assert.deepEqual(r.tray[0].latest, at(4));
  assert.deepEqual(r.benStories.map((s) => [s.id, s.seen]), [[p(80), false], [p(81), false]]);
  assert.deepEqual(r.cleoStories.map((s) => [s.id, s.seen]), [[p(83), true]]);
  // Activity for ana: likes and comments on her post by others, and ben following her.
  assert.deepEqual(r.activity.map((a) => [a.type, a.user.username, a.post?.id ?? null]), [
    ["repost", "ben.k", p(3)],
    ["repost", "dev", p(3)],
    ["like", "cleo_x", p(3)],
    ["comment", "ben.k", p(3)],
    ["like", "ben.k", p(3)],
    ["follow", "ben.k", null],
  ]);
  assert.equal(r.activity[3].body, "Welcome! @ana");
  assert.equal(r.activity[5].following, true, "ana follows ben back");
  assert.deepEqual(r.suggestions.map((s) => s.username), ["dev"]);
  assert.deepEqual(r.devSuggestions.map((s) => [s.username, s.followed_by]), [["ben.k", null], ["ana", null]]);
  assert.deepEqual(r.search.map((s) => s.username), ["ben.k", "cleo_x", "dev"], "name or username matches, most followed first");
  assert.deepEqual(r.searchName.map((s) => s.username), ["dev"]);
  assert.deepEqual(r.searchExact, [dev], "an exact username comes first");
  assert.deepEqual(r.mutuals, { names: ["cleo_x"], total: 1 });
  assert.deepEqual(r.followers.map((f) => [f.username, f.following]), [["ana", false], ["cleo_x", true]]);
  assert.deepEqual(r.following.map((f) => [f.username, f.following]), [["ben.k", false], ["cleo_x", false]], "seen by ben, who follows only ana");
  assert.deepEqual(r.isFollowing, [true, false]);
  // Reels, plays and music.
  assert.deepEqual([r.reel.kind, r.reel.video, r.reel.music, r.reel.aspect, r.reel.views], ["reel", "/media/reels/reel-01.mp4", "night-drive", "vertical", 122]);
  assert.equal(r.post.kind, "photo");
  assert.equal(r.post.video, "");
  assert.deepEqual(r.reels, [p(7)]);
  assert.deepEqual(r.cleoReels, [p(7)]);
  assert.deepEqual(r.cleoPosts, [p(6), p(7), p(2)]);
  assert.deepEqual(r.audio, [[p(1)], [p(7)], 1]);
  assert.equal(r.benStories[0].music, "stardust");
  assert.equal(r.benStories[1].music, "");
  // Reposts.
  assert.deepEqual(r.repostsByCleo, [p(4), p(1)], "most recent repost first");
  assert.deepEqual([r.repostedForBen.repost_count, r.repostedForBen.reposted], [2, true]);
  assert.deepEqual([r.post.repost_count, r.post.reposted], [2, true], "seen by ben, who reposted it");
  // Messages.
  assert.deepEqual(r.inboxBefore.map((c) => [c.user.username, c.last.body, c.last.shared, c.last.mine, c.unread]), [
    ["dev", "hello", false, true, 0],
    ["cleo_x", "lunch?", false, false, 1],
    ["ben.k", "", true, false, 2],
  ]);
  assert.equal(r.unreadBefore, 2);
  assert.deepEqual(r.threadBefore.map((x) => [x.body, x.mine, x.read_at]), [["hi ana", false, null], ["hey!", true, null], ["", false, null]]);
  assert.deepEqual(r.threadBefore[2].post, { id: p(6), kind: "photo", image: `https://img.test/${p(6)}.jpg`, filter: "normal", caption: "No tags here", user: { username: "cleo_x", avatar: "" } });
  assert.deepEqual(r.lastTwo.map((x) => x.body), ["hey!", ""]);
  assert.deepEqual([r.marked, r.markedAgain, r.unreadAfter], [2, 0, 1]);
  assert.deepEqual(r.threadAfter.map((x) => x.read_at), [at(0.1), null, at(0.1)], "only what ben sent is marked read");
  assert.deepEqual(r.benInbox.map((c) => [c.user.username, c.unread]), [["dev", 1], ["ana", 1]]);
  assert.deepEqual(r.shareTargets, ["dev", "cleo_x", "ben.k"], "recent chats first, then people ana follows");
}

async function writes(store, r) {
  const { ana, ben, cleo, p } = r.ids;
  assert.equal(await store.unlike(cleo, p(1)), 2);
  assert.equal(await store.like(ana, p(1)), 2, "liking twice keeps one like");
  await store.updatePost(p(3), { caption: "Edited #new", filter: "moon", aspect: "portrait", user_id: ben });
  const edited = await store.getPost(p(3), ana);
  assert.deepEqual([edited.caption, edited.filter, edited.aspect, edited.user.id], ["Edited #new", "moon", "portrait", ana]);
  await store.updateUser(ana, { name: "Ana S.", bio: "", username: "hacked" });
  assert.deepEqual([(await store.userById(ana)).name, (await store.userById(ana)).username], ["Ana S.", "ana"]);
  assert.equal(await store.removeComment(p(91)), true);
  assert.equal(await store.removeComment(p(91)), false);
  await store.unsave(ana, p(2));
  await store.unfollow(ana, ben);
  assert.equal(await store.isFollowing(ana, ben), false);
  assert.equal(await store.removePost(p(1)), true);
  assert.equal(await store.getPost(p(1), ana), null);
  assert.equal(await store.removePost(p(1)), false);
  assert.deepEqual(ids(await store.savedPosts(ana, { limit: 10 })), [p(6)]);
  assert.equal(await store.audioCount("golden-hour"), 0, "the deleted post's music is gone with it");
  assert.equal(await store.unrepost(cleo, p(4)), 1);
  assert.equal(await store.repost(ana, p(4)), 2);
  assert.equal(await store.repost(ana, p(4)), 2, "reposting twice keeps one repost");
  await store.updatePost(p(7), { music: "" });
  assert.equal((await store.getPost(p(7), ana)).music, "");
  assert.equal(await store.removePost(p(6)), true);
  assert.equal((await store.thread(ana, ben)).at(-1).post, null, "a shared post that was deleted shows as unavailable");
  await assert.rejects(store.createUser({ id: "99999999-0000-4000-8000-000000000000", username: "ana", passwordHash: "!" }), { code: "TAKEN" });
}

/** The same reads over the whole demo data set, to compare the two stores on realistic data. */
async function demoReads(store, data) {
  const demo = data.users.find((u) => u.username === DEMO.username).id;
  const feed = [];
  let before = null;
  for (let i = 0; i < 4; i++) {
    const page = await store.feed(demo, { limit: 8, before });
    feed.push(...page.posts);
    before = parseCursor(page.next);
  }
  const someone = data.users[7].id;
  return {
    feed,
    explore: await store.explore(demo, { limit: 30, offset: 10, now: NOW }),
    profile: await store.userPosts(demo, someone, { limit: 30 }),
    saved: await store.savedPosts(demo, { limit: 30 }),
    tag: await store.tagPosts("travel", demo, { limit: 30 }),
    tagCount: await store.tagCount("sunset"),
    tray: (await store.storyTray(demo, NOW)).sort((a, b) => (a.user.username < b.user.username ? -1 : 1)),
    activity: await store.activity(demo, { limit: 40 }),
    suggestions: await store.suggestions(demo, 5),
    search: await store.searchUsers("ma", 20),
    counts: await store.profileCounts(someone),
    followers: await store.followers(someone, demo),
    comments: await store.comments(data.posts[3].id),
    reels: await store.reels(demo, { limit: 20, now: NOW }),
    demoReels: await store.userPosts(demo, someone, { limit: 10, kind: "reel" }),
    reposts: await store.repostsBy(someone, demo, { limit: 20 }),
    audio: await store.audioPosts("golden-hour", demo, { limit: 20 }),
    audioCount: await store.audioCount("city-lights"),
    inbox: await store.inbox(demo),
    unread: await store.unreadThreads(demo),
    thread: await store.thread(demo, (await store.inbox(demo))[0].user.id),
    shareTargets: await store.shareTargets(demo, 30),
    stories: await store.stories((await store.storyTray(demo, NOW)).map((t) => t.user).sort((a, b) => (a.username < b.username ? -1 : 1))[0].id, demo, NOW),
  };
}

const stores = [["memory", async () => ({ store: memoryStore(), reset: async () => {} })]];
if (useMysql) stores.push(["mysql", openMysql]);
const results = {};

for (const [kind, open] of stores) {
  describe(`${kind} store`, () => {
    let handle;
    before(async () => {
      handle = await open();
      await handle.reset();
    });
    after(async () => handle.pool?.end());

    test("reads give the right answers", async () => {
      results[kind] = await scenario(handle.store);
      checkScenario(results[kind]);
    });

    test("writes: likes, edits, deletes, unfollows and unique usernames", async () => {
      await writes(handle.store, results[kind]);
    });

    test("demo data: 40 accounts and 500 posts load and read back", async () => {
      await handle.reset();
      const store = kind === "memory" ? memoryStore() : handle.store;
      const data = demoData({ now: NOW });
      await store.bulk(data);
      results[`${kind}-demo`] = await demoReads(store, data);
      const r = results[`${kind}-demo`];
      assert.equal(r.feed.length, 32);
      assert.ok(r.feed.some((x) => x.reposted_by), "the feed has reposts");
      assert.ok(r.tray.length >= 10);
      assert.ok(r.activity.length >= 10);
      assert.equal(r.reels.length, 13, "everyone's reels but the demo account's own");
      assert.equal(r.demoReels.length, 1);
      assert.equal(r.inbox.length, 7);
      assert.ok(r.unread >= 1);
    });
  });
}

if (useMysql) {
  test("MySQL and the in-memory store return identical results", () => {
    const { ids: a, ...mysql } = results.mysql;
    const { ids: b, ...memory } = results.memory;
    assert.deepEqual(mysql, memory);
    assert.deepEqual(results["mysql-demo"], results["memory-demo"]);
  });
} else {
  test("MySQL comparison (set TEST_DB_PORT or TEST_DB_HOST to run it)", { skip: "no test database configured" }, () => {});
}

test("demo data is the same every run and looks real", () => {
  const a = demoData({ now: NOW });
  const b = demoData({ now: NOW });
  assert.deepEqual(a, b);
  assert.equal(a.users.length, 40);
  const photos = a.posts.filter((p) => p.kind === "photo");
  const reels = a.posts.filter((p) => p.kind === "reel");
  assert.deepEqual([photos.length, reels.length], [500, 14]);
  assert.equal(new Set(a.users.map((u) => u.username)).size, 40);
  assert.equal(new Set(a.posts.map((p) => p.id)).size, 514);
  for (const u of a.users) assert.match(u.username, /^[a-z0-9._]{1,30}$/);
  for (const p of photos) assert.match(p.image, /^https:\/\/picsum\.photos\/seed\/\w+\/1080\/\d+$/);
  for (const p of a.posts) assert.ok(p.created_at <= NOW && NOW - p.created_at < 121 * DAY);
  assert.deepEqual(new Set(reels.map((r) => r.video)).size, 14, "each demo video is used once");
  for (const r of reels) {
    assert.match(r.video, /^\/media\/reels\/reel-\d\d\.mp4$/);
    assert.equal(r.image, r.video.replace(".mp4", ".jpg"));
    assert.ok(existsSync(new URL(`../public${r.video}`, import.meta.url)), `${r.video} is in public/`);
  }
  const trackIds = new Set(TRACKS.map((t) => t.id));
  for (const x of [...a.posts, ...a.stories]) assert.ok(x.music === "" || trackIds.has(x.music));
  for (const t of TRACKS) assert.ok(existsSync(new URL(`../public/media/music/${t.id}.mp3`, import.meta.url)), `${t.id}.mp3 is in public/`);
  for (const s of a.stories) assert.ok(NOW - s.created_at < DAY, "stories are from the last 24 hours");
  assert.equal(a.posts.filter((p) => p.user_id === a.users[0].id).length, 10, "the demo account has 9 photos and a reel");
  assert.equal(new Set(a.likes.map((l) => `${l.post_id} ${l.user_id}`)).size, a.likes.length, "no duplicate likes");
  assert.equal(new Set(a.reposts.map((r) => `${r.post_id} ${r.user_id}`)).size, a.reposts.length, "no duplicate reposts");
  const authorOf = new Map(a.posts.map((p) => [p.id, p.user_id]));
  for (const r of a.reposts) assert.notEqual(authorOf.get(r.post_id), r.user_id, "nobody reposts their own post");
  for (const x of [...a.likes, ...a.reposts, ...a.messages]) assert.ok(x.created_at <= NOW);
  for (const m of a.messages) assert.ok(!m.read_at || m.read_at >= m.created_at);
});
