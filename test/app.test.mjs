// End-to-end tests over HTTP: the real Express app and views, with 500 Faker posts in an
// in-memory store (no MySQL needed). Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp, PAGE_SIZE } from "../app.mjs";
import { fakePosts } from "../seed.mjs";
import { mysqlPosts } from "../posts.mjs";
import { imageStore } from "../images.mjs";

/** The same interface as posts.mjs, kept in memory (newest first). */
function memoryPosts(initial = []) {
  const rows = [...initial];
  return {
    rows,
    async list(limit, offset) { return rows.slice(offset, offset + limit); },
    async count() { return rows.length; },
    async get(id) { return rows.find((p) => p.id === id) || null; },
    async create(post) { rows.unshift(post); },
    async update(id, fields) { Object.assign(rows.find((p) => p.id === id), fields); },
    async remove(id) {
      const i = rows.findIndex((p) => p.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

let server, base, store, uploadDir;
const stored = [];

before(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "insta-uploads-"));
  store = memoryPosts(fakePosts(500));
  const app = createApp({
    posts: store,
    storeImage: async (file) => {
      stored.push(file);
      return `https://i.imgur.test/${file.filename}`;
    },
    uploadDir,
  });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(uploadDir, { recursive: true, force: true });
});

const html = async (url) => {
  const res = await fetch(base + url);
  return { status: res.status, body: await res.text() };
};
const postCount = (body) => (body.match(/class="post"/g) || []).length;

test("seed data: 500 posts, unique ids, every field filled, the same every run", () => {
  const posts = fakePosts(500);
  assert.equal(posts.length, 500);
  assert.equal(new Set(posts.map((p) => p.id)).size, 500);
  for (const p of posts) {
    for (const k of ["id", "username", "name", "image", "comment"]) assert.ok(p[k], `${k} is empty`);
    assert.match(p.image, /^https:\/\/picsum\.photos\/seed\//);
    assert.ok(p.username.length <= 30);
  }
  assert.deepEqual(fakePosts(3), fakePosts(3));
});

test("GET / and GET /posts list the posts, 24 per page across 21 pages", async () => {
  const first = await html("/");
  assert.equal(first.status, 200);
  assert.match(first.body, /500 posts/);
  assert.equal(postCount(first.body), PAGE_SIZE);
  assert.match(first.body, /Page 1 of 21/);
  assert.match(first.body, new RegExp(store.rows[0].username));
  const last = await html("/posts?page=21");
  assert.equal(postCount(last.body), 500 - 20 * PAGE_SIZE);
  assert.match(last.body, /Page 21 of 21/);
  assert.equal(postCount((await html("/?page=999")).body), 500 - 20 * PAGE_SIZE, "a page past the end shows the last page");
});

test("POST /posts creates a post with its image", async () => {
  const form = new FormData();
  form.append("username", "abhi94");
  form.append("name", "Abhay");
  form.append("comment", "Sunrise at the lake");
  form.append("image", new Blob([Uint8Array.of(137, 80, 78, 71)], { type: "image/png" }), "photo.png");
  const res = await fetch(`${base}/posts`, { method: "POST", body: form, redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(store.rows.length, 501);
  const post = store.rows[0];
  assert.deepEqual([post.username, post.name, post.comment], ["abhi94", "Abhay", "Sunrise at the lake"]);
  assert.match(post.image, /^https:\/\/i\.imgur\.test\/.+\.png$/);
  assert.equal(stored.at(-1).originalname, "photo.png");
  assert.match((await html("/")).body, /Sunrise at the lake/);
});

test("POST /posts without a username or name is refused", async () => {
  const res = await fetch(`${base}/posts`, { method: "POST", body: new URLSearchParams({ username: " ", name: "x" }) });
  assert.equal(res.status, 400);
  assert.equal(store.rows.length, 501);
});

test("GET /posts/:id shows one post; GET /posts/:id/edit the edit form; unknown ids are 404", async () => {
  const post = store.rows[10];
  const show = await html(`/posts/${post.id}`);
  assert.equal(show.status, 200);
  assert.match(show.body, new RegExp(post.username));
  const edit = await html(`/posts/${post.id}/edit`);
  assert.match(edit.body, /Edit your Insta Post/);
  assert.equal((await html("/posts/not-a-post")).status, 404);
});

test("PATCH /posts/:id changes the comment (and the image when a new one is sent)", async () => {
  const post = store.rows[5];
  const res = await fetch(`${base}/posts/${post.id}?_method=PATCH`, { method: "POST", body: new URLSearchParams({ comment: "Edited caption" }), redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), `/posts/${post.id}`);
  assert.equal((await store.get(post.id)).comment, "Edited caption");
  const form = new FormData();
  form.append("image", new Blob([Uint8Array.of(255, 216, 255)], { type: "image/jpeg" }), "new.jpg");
  await fetch(`${base}/posts/${post.id}?_method=PATCH`, { method: "POST", body: form });
  assert.match((await store.get(post.id)).image, /\.jpg$/);
});

test("DELETE /posts/:id removes the post; a second delete is 404", async () => {
  const post = store.rows[3];
  const res = await fetch(`${base}/posts/${post.id}?_method=DELETE`, { method: "POST", redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(await store.get(post.id), null);
  assert.equal((await fetch(`${base}/posts/${post.id}?_method=DELETE`, { method: "POST" })).status, 404);
});

test("text from users is escaped in the pages (no HTML injection)", async () => {
  await store.create({ id: "x1", username: "<script>alert(1)</script>", name: "n", image: "", comment: "<b>hi</b>" });
  const body = (await html("/posts/x1")).body;
  assert.ok(!body.includes("<script>alert(1)</script>"));
  assert.match(body, /&lt;script&gt;/);
});

test("MySQL queries only use placeholders: input never becomes SQL", async () => {
  const calls = [];
  const pool = { query: async (sql, params) => (calls.push({ sql, params }), /SELECT COUNT/.test(sql) ? [[{ n: 1 }]] : [[], {}]) };
  const posts = mysqlPosts(pool);
  const evil = `"); DROP TABLE instauser; --`;
  await posts.create({ id: "1", username: evil, name: evil, image: "", comment: evil });
  await posts.get(evil);
  await posts.update(evil, { comment: evil, image: "x", username: "ignored" });
  pool.query = async (sql, params) => (calls.push({ sql, params }), [{ affectedRows: 0 }]);
  await posts.remove(evil);
  for (const c of calls) assert.ok(!c.sql.includes("DROP TABLE"), c.sql);
  assert.ok(calls.every((c) => c.params.includes(evil) || c.params.flat().includes(evil)));
  assert.match(calls[2].sql, /^UPDATE instauser SET comment = \?, image = \? WHERE id = \?$/, "only comment and image can change");
});

test("images go to Imgur with the Client-ID from .env, else stay on this server", async () => {
  assert.equal(await imageStore({ clientId: "" })({ filename: "a.png" }), "/uploads/a.png");
  const file = path.join(uploadDir, "b.png");
  await (await import("node:fs/promises")).writeFile(file, Uint8Array.of(1, 2, 3));
  let sent;
  const fakeImgur = async (url, init) => {
    sent = { url, auth: init.headers.Authorization };
    return new Response(JSON.stringify({ success: true, data: { link: "https://i.imgur.com/abc.png" } }), { status: 200 });
  };
  assert.equal(await imageStore({ clientId: "my-client-id", fetchImpl: fakeImgur })({ filename: "b.png", path: file }), "https://i.imgur.com/abc.png");
  assert.deepEqual(sent, { url: "https://api.imgur.com/3/image", auth: "Client-ID my-client-id" });
});
