# Social Media App (Instagram-style posts)

A server-rendered photo feed: create, view, edit and delete posts with an image and a caption.
Node.js, Express, EJS templates, MySQL, and the Imgur API for image hosting.

- **5 REST endpoints** for posts (create, read, update, delete) with server-rendered EJS pages
- **MySQL** storage with parameterised queries only (no SQL injection through captions or ids)
- **Imgur API** image hosting: uploads are sent to Imgur and the image URL is stored in MySQL
  (without an Imgur key, images stay in `public/uploads` on the server)
- **500 sample posts** generated with Faker (`npm run seed`), shown 24 per page
- **Responsive layout** for five viewport sizes: 4 posts per row on large desktops, 3 on laptops,
  2 on tablets, 1 on phones and a compact layout on small phones
- **End-to-end tests** over HTTP on the 500 generated posts (`npm test`, no database needed)

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/posts` (also `/`) | All posts, newest first, 24 per page (`?page=2`) |
| POST | `/posts` | Create a post (username, name, image, caption) |
| GET | `/posts/:id` | One post |
| PATCH | `/posts/:id` | Change the caption and/or the image |
| DELETE | `/posts/:id` | Delete a post |

Pages: `/posts/new` (form) and `/posts/:id/edit`. The HTML forms send PATCH and DELETE through
`method-override` (`?_method=PATCH`).

## Run it

You need Node.js 18+ and MySQL 8.

```bash
npm install
cp .env.example .env     # then put your MySQL password (and optionally an Imgur Client ID) in .env
npm run seed             # creates the database and table, adds 500 sample posts
npm start                # http://localhost:8080
```

Settings in `.env` (never commit it — it is git-ignored):

| Variable | Default | |
|---|---|---|
| `DB_HOST`, `DB_PORT` | `localhost`, `3306` | MySQL server |
| `DB_USER`, `DB_PASSWORD` | `root`, — | MySQL login |
| `DB_NAME` | `insta_post` | created if missing |
| `IMGUR_CLIENT_ID` | — | Client ID of your Imgur app ([register one](https://api.imgur.com/oauth2/addclient)) |
| `PORT` | `8080` | |

`node seed.mjs 1000` adds any number of posts (the same seed always generates the same posts).

## Tests

```bash
npm test
```

The tests start the real app and drive it over HTTP with the 500 Faker posts in memory: listing and
pagination, creating a post with an image, viewing, editing, deleting, input validation, HTML escaping,
the Imgur upload, and that every MySQL query uses placeholders.

## Files

```
index.mjs        start the server (reads .env, connects to MySQL)
app.mjs          routes and pages
posts.mjs        MySQL table and queries
images.mjs       Imgur upload (or local storage)
seed.mjs         500 Faker posts
views/           EJS pages (index, show, new, edit)
public/          CSS, logo and local uploads
test/            end-to-end tests
```
