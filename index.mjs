// Starts the server.
//   npm start      → MySQL, with the settings from .env (copy .env.example to .env; run `npm run seed` once)
//   npm run demo   → no database: the demo data is generated in memory and is gone when you stop the server
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createApp } from "./app.mjs";
import { imageStore } from "./images.mjs";
import { memoryStore } from "./store/memory.mjs";
import { DEMO, seedStore } from "./seed.mjs";

const demoMode = process.argv.includes("--demo") || process.env.DB === "memory";
let store;
let pool;

if (demoMode) {
  store = memoryStore();
  const data = await seedStore(store);
  console.log(`Demo mode (no database): ${data.users.length} accounts and ${data.posts.length} posts in memory.`);
} else {
  const { connect, mysqlStore } = await import("./store/mysql.mjs");
  try {
    pool = await connect();
    console.log("Connected to MySQL");
  } catch (err) {
    console.error("Could not connect to MySQL:", err.message);
    console.error("Check DB_HOST / DB_USER / DB_PASSWORD / DB_NAME in your .env file, or run `npm run demo` to try the app without a database.");
    process.exit(1);
  }
  store = mysqlStore(pool);
}

let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = randomBytes(32).toString("hex");
  if (!demoMode) console.warn("SESSION_SECRET is not set in .env, so everyone is logged out when the server restarts.");
}

const app = createApp({
  store,
  secret,
  storeImage: imageStore({ clientId: process.env.IMGUR_CLIENT_ID || "" }),
  demo: demoMode ? DEMO : null,
});

const PORT = Number(process.env.PORT) || 8080;
const server = app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Log in as "${DEMO.username}" with the password "${DEMO.password}"${demoMode ? "" : " (after `npm run seed`)"}.`);
});

process.on("SIGINT", async () => {
  server.close();
  if (pool) {
    await pool.end().catch(() => {});
    console.log("MySQL connection closed");
  }
  process.exit(0);
});
