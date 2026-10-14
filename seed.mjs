// Fills the database with sample posts made with Faker (500 by default).
// Usage: npm run seed            → 500 posts
//        node seed.mjs 1000      → any number
import "dotenv/config";
import { faker } from "@faker-js/faker";
import { fileURLToPath } from "node:url";
import { connect, mysqlPosts } from "./posts.mjs";

/** `count` realistic posts; the same seed always gives the same posts. */
export function fakePosts(count = 500, seed = 94) {
  faker.seed(seed);
  return Array.from({ length: count }, () => ({
    id: faker.string.uuid(),
    username: faker.internet.userName().toLowerCase().slice(0, 30),
    name: faker.person.fullName(),
    image: `https://picsum.photos/seed/${faker.string.alphanumeric(12)}/600/600`,
    comment: faker.lorem.sentence({ min: 4, max: 14 }),
  }));
}

async function main() {
  const count = Number.parseInt(process.argv[2], 10) || 500;
  const pool = await connect();
  const posts = mysqlPosts(pool);
  const all = fakePosts(count);
  for (let i = 0; i < all.length; i += 100) await posts.createMany(all.slice(i, i + 100));
  console.log(`Added ${count} posts — ${await posts.count()} in the database now.`);
  await pool.end();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
