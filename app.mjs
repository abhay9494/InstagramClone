// The web app: photo posts with a username, name, image and comment.
// Routes (REST): GET /posts · POST /posts · GET /posts/:id · PATCH /posts/:id · DELETE /posts/:id
// plus the pages GET / (same as /posts), GET /posts/new and GET /posts/:id/edit.
// Data and image storage are passed in, so the app runs the same against MySQL or in tests.
import express from "express";
import methodOverride from "method-override";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PAGE_SIZE = 24;

/**
 * posts:      { list(limit, offset), count(), get(id), create(post), update(id, fields), remove(id) }
 * storeImage: (uploadedFile) => URL of the stored image
 * uploadDir:  where multer keeps uploaded images (default public/uploads)
 */
export function createApp({ posts, storeImage, uploadDir = path.join(here, "public", "uploads") }) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(here, "views"));
  app.use(methodOverride("_method"));
  app.use(express.static(path.join(here, "public")));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname)),
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
  });
  // Async route handlers: errors go to the error handler below instead of crashing the server.
  const route = (fn) => (req, res, next) => fn(req, res).catch(next);
  const text = (v) => (typeof v === "string" ? v.trim() : "");

  const list = route(async (req, res) => {
    const total = await posts.count();
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const results = await posts.list(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    res.render("index", { results, page, pages, total });
  });
  app.get("/", list);
  app.get("/posts", list);

  app.get("/posts/new", (req, res) => res.render("new"));

  app.post("/posts", upload.single("image"), route(async (req, res) => {
    const username = text(req.body.username);
    const name = text(req.body.name);
    if (!username || !name) return res.status(400).send("Username and name are required.");
    const image = req.file ? await storeImage(req.file) : "";
    await posts.create({ id: randomUUID(), username, name, image, comment: text(req.body.comment) });
    res.redirect("/");
  }));

  const onePost = (view) => route(async (req, res) => {
    const post = await posts.get(req.params.id);
    if (!post) return res.status(404).send("Post not found.");
    res.render(view, { post });
  });
  app.get("/posts/:id", onePost("show"));
  app.get("/posts/:id/edit", onePost("edit"));

  app.patch("/posts/:id", upload.single("image"), route(async (req, res) => {
    const post = await posts.get(req.params.id);
    if (!post) return res.status(404).send("Post not found.");
    const fields = {};
    if (typeof req.body.comment === "string") fields.comment = text(req.body.comment);
    if (req.file) fields.image = await storeImage(req.file);
    if (Object.keys(fields).length) await posts.update(post.id, fields);
    res.redirect(`/posts/${post.id}`);
  }));

  app.delete("/posts/:id", route(async (req, res) => {
    if (!(await posts.remove(req.params.id))) return res.status(404).send("Post not found.");
    res.redirect("/");
  }));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send("Something went wrong. Please try again.");
  });
  return app;
}
