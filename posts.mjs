// MySQL storage for posts. Every value goes through a ? placeholder (never into the SQL text),
// so input like  "); DROP TABLE instauser; --  is stored as plain text.
import mysql from "mysql2/promise";

export const TABLE = `CREATE TABLE IF NOT EXISTS instauser (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  image VARCHAR(500) NOT NULL DEFAULT '',
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

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

/** Creates the database (if needed) and returns a connection pool to it. */
export async function connect(config = dbConfig()) {
  const { database, ...server } = config;
  const admin = await mysql.createConnection(server);
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await admin.end();
  const pool = mysql.createPool({ ...config, connectionLimit: 5 });
  await ensureTable(pool);
  return pool;
}

export async function ensureTable(pool) {
  await pool.query(TABLE);
  // Tables made by the first version of the app have no created_at column.
  const [cols] = await pool.query("SHOW COLUMNS FROM instauser LIKE 'created_at'");
  if (!cols.length) await pool.query("ALTER TABLE instauser ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
}

const COLUMNS = "id, username, name, image, comment";

export function mysqlPosts(pool) {
  return {
    async list(limit, offset) {
      const [rows] = await pool.query(`SELECT ${COLUMNS} FROM instauser ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, [limit, offset]);
      return rows;
    },
    async count() {
      const [[row]] = await pool.query("SELECT COUNT(*) AS n FROM instauser");
      return Number(row.n);
    },
    async get(id) {
      const [rows] = await pool.query(`SELECT ${COLUMNS} FROM instauser WHERE id = ?`, [id]);
      return rows[0] || null;
    },
    async create(post) {
      await pool.query(`INSERT INTO instauser (${COLUMNS}) VALUES (?, ?, ?, ?, ?)`, [post.id, post.username, post.name, post.image, post.comment]);
    },
    /** Many posts in one statement (used by the seed script). */
    async createMany(list) {
      if (!list.length) return;
      await pool.query(`INSERT INTO instauser (${COLUMNS}) VALUES ?`, [list.map((p) => [p.id, p.username, p.name, p.image, p.comment])]);
    },
    async update(id, fields) {
      const cols = ["comment", "image"].filter((c) => c in fields);
      if (!cols.length) return;
      await pool.query(`UPDATE instauser SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => fields[c]), id]);
    },
    async remove(id) {
      const [result] = await pool.query("DELETE FROM instauser WHERE id = ?", [id]);
      return result.affectedRows > 0;
    },
  };
}
