// Starts the server: MySQL settings and the optional Imgur Client ID come from .env
// (copy .env.example to .env). Run `npm run seed` once to add 500 sample posts.
import "dotenv/config";
import { createApp } from "./app.mjs";
import { connect, mysqlPosts } from "./posts.mjs";
import { imageStore } from "./images.mjs";

let pool;
try {
  pool = await connect();
  console.log("Connected to MySQL");
} catch (err) {
  console.error("Could not connect to MySQL:", err.message);
  console.error("Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME in your .env file.");
  process.exit(1);
}

const app = createApp({
  posts: mysqlPosts(pool),
  storeImage: imageStore({ clientId: process.env.IMGUR_CLIENT_ID || "" }),
});

const PORT = Number(process.env.PORT) || 8080;
const server = app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));

process.on("SIGINT", async () => {
  server.close();
  await pool.end().catch(() => {});
  console.log("MySQL connection closed");
  process.exit(0);
});
