// Demo data made with Faker: 40 accounts with 500 photo posts and 14 reels, follows, likes, comments,
// saves, reposts, stories, music and chats, plus a demo account to log in with.
// The same seed always gives the same data.
// Usage: npm run seed              → fills an empty MySQL database
//        npm run seed -- --reset   → deletes the app's tables first, then fills them
import "dotenv/config";
import { faker } from "@faker-js/faker";
import { fileURLToPath } from "node:url";
import { DAY, HOUR } from "./store/shared.mjs";
import { hashPassword } from "./lib/auth.mjs";
import { FILTERS } from "./lib/text.mjs";
import { TRACKS } from "./lib/music.mjs";

export const DEMO = { username: "demo", password: "instaclone" };

const CAPTIONS = [
  "Golden hour never misses", "Sunday, slowly", "Found my new favourite corner of the city",
  "Couldn't stop looking at this view", "Proof that I do go outside sometimes", "Took the long way home",
  "Small moments, big feelings", "This light though", "Weekend plans: exactly this", "Mood for the rest of the week",
  "Late night walks are underrated", "The coffee was good, the view was better", "A little piece of quiet",
  "Some days are just made for wandering", "Saved this one for a rainy day", "Still thinking about this place",
  "Can we go back already?", "Not a bad office for the day", "Caught the last bit of sun", "Colours I didn't edit",
  "Morning run views 🏃", "Brunch, but make it art", "Home is wherever the snacks are", "First try, no filter",
  "The city looked unreal tonight", "Collecting skies", "Postcard from somewhere good", "Room with a view ✨",
  "Fresh air, clear head", "This is your sign to take a day off", "Paint still drying 🎨", "Tiny garden update 🌱",
  "Plot twist: it was sunny all day", "Back to where it started", "Roads like this are why I drive",
  "Recipe in the comments if you ask nicely", "Throwback to the best trip", "Slow mornings > everything",
  "Looking up more often", "Friends, food, and too many photos", "One more from the archive",
  "Didn't plan this one, it just happened", "Waves for days 🌊", "Good things take time", "Mountain air hits different ⛰️",
];
const TAGS = [
  "travel", "sunset", "foodie", "coffee", "nature", "photography", "weekend", "citylife", "goldenhour",
  "mountains", "beach", "art", "fitness", "music", "friends", "streetphotography", "minimal", "architecture",
  "explore", "plants", "rainyday", "roadtrip", "homemade", "filmphotography", "nofilter",
];
const COMMENTS = [
  "This is stunning 😍", "Where is this?", "Okay this is the vibe", "Need to go here asap", "Frame this 🔥",
  "The colours!!", "So good", "Love this one", "🙌🙌", "Wow", "Take me with you next time", "That light though",
  "Iconic", "Obsessed", "Recipe please 🙏", "This made my day", "Miss this place", "Goals", "Incredible shot",
  "Saving this for later", "You always find the best spots", "😂 classic", "Absolutely beautiful",
  "Wallpaper material", "Can't stop looking at this", "How did you get this shot?", "Dreamy ✨", "Big mood",
  "So peaceful", "Ok but the composition 👌", "Unreal", "Adding this to my list", "Teach me your ways",
];
const BIOS = [
  "Coffee first ☕", "Chasing light 📷", "Plant parent 🌿", "Weekend hiker ⛰️", "Food is my love language 🍜",
  "Designer by day, DJ by night", "Collecting sunsets", "Film photos and long walks", "Making things with my hands",
  "Runner. Reader. Rambler.", "Dog person 🐕", "Probably at the beach 🌊", "Small kitchen, big flavours",
  "Street photography + city walks", "Learning to paint 🎨", "Tea > coffee", "Travel notes from everywhere",
  "Cyclist 🚴 early mornings", "Books and rainy days 📚", "Architecture nerd", "Here for the sunsets",
  "Amateur baker, professional taster", "Somewhere between the mountains and the sea", "",
];
const REEL_CAPTIONS = [
  "POV: the weekend finally arrives", "Three photos, one perfect day", "Wait for the last one", "Saving this view forever",
  "Little moments from this week", "Take me back", "This place is a whole mood", "If you know, you know",
  "Sound on for this one 🔊", "Ten seconds of calm", "The city at its best", "Didn't want this day to end",
  "Weekend dump", "Golden hour hits different on video",
];
const LINES = [
  "hey!! how was the trip?", "Did you see this?", "omg yes", "haha that's so you", "We should go there next weekend",
  "I'm in 🙌", "Send me the photos pls", "Coffee tomorrow?", "Sure, 10am?", "Perfect", "That sunset post was unreal",
  "thank you!! took forever to get that shot", "where was this?", "Lisbon! you'd love it", "Are you coming tonight?",
  "running a bit late, save me a seat", "lol", "🔥🔥", "Can you send me the recipe?", "on it", "miss you!",
  "Look at this 😂", "this is literally us", "ok that reel was so good", "brb", "yes!!",
];
const SIZES = { square: [1080, 1080], portrait: [1080, 1350], landscape: [1080, 566] };

/** A small seeded random generator (mulberry32), so the numbers are the same every run. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rows for every table (column names as in MySQL). Times are relative to `now`, so the demo always
 * looks recent: posts from the last 120 days, stories from the last 22 hours.
 */
export function demoData({ users: userCount = 40, posts: postCount = 500, seed = 94, now = new Date(), demoHash = "!" } = {}) {
  faker.seed(seed);
  const rnd = random(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const sample = (list, n) => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  };
  const ago = (ms) => new Date(+now - Math.floor(ms));
  const between = (from, to) => new Date(+from + Math.floor(rnd() * (to - from)));

  // Accounts: the demo account first (the only one with a password), then Faker people.
  const users = [{
    id: faker.string.uuid(), username: DEMO.username, name: "Demo Account",
    bio: "Trying out the clone 📸 Change this in Edit profile", avatar: "https://i.pravatar.cc/300?img=12",
    password_hash: demoHash, created_at: ago(400 * DAY), pop: 0.3,
  }];
  const taken = new Set([DEMO.username]);
  while (users.length < userCount) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const username = faker.internet.username({ firstName, lastName }).toLowerCase().replace(/[^a-z0-9._]/g, "").replace(/^\.+|\.+$/g, "").slice(0, 30);
    if (!username || taken.has(username)) continue;
    taken.add(username);
    users.push({
      id: faker.string.uuid(), username, name: `${firstName} ${lastName}`, bio: pick(BIOS),
      avatar: `https://i.pravatar.cc/300?img=${(users.length % 70) + 1}`,
      password_hash: "!", created_at: ago((200 + rnd() * 600) * DAY), pop: rnd() ** 2,
    });
  }
  const [demo, ...people] = users;

  // Follows: the demo account follows the 22 most popular people; everyone else follows 6–20 people.
  const follows = [];
  const followSet = new Set();
  const addFollow = (a, b, at) => {
    if (a.id === b.id || followSet.has(`${a.id} ${b.id}`)) return;
    followSet.add(`${a.id} ${b.id}`);
    follows.push({ follower_id: a.id, followee_id: b.id, created_at: at });
  };
  for (const p of [...people].sort((a, b) => b.pop - a.pop).slice(0, 22)) addFollow(demo, p, ago((5 + rnd() * 170) * DAY));
  for (const u of people) {
    const others = users.filter((x) => x !== u).sort((a, b) => b.pop + rnd() * 0.6 - (a.pop + rnd() * 0.6));
    for (const v of others.slice(0, 6 + Math.floor(rnd() * 15))) addFollow(u, v, ago((3 + rnd() * 300) * DAY));
  }
  for (const u of sample(people, 6)) addFollow(u, demo, ago(rnd() * 3 * DAY)); // recent followers, for Activity

  // Posts: 9 by the demo account, the rest spread by popularity, newer ones more likely.
  const posts = [];
  const authors = [...Array(9).fill(demo)];
  while (authors.length < postCount) {
    const u = people[Math.floor(rnd() * people.length)];
    if (rnd() < 0.35 + u.pop) authors.push(u);
  }
  for (const [i, u] of authors.entries()) {
    const aspect = rnd() < 0.62 ? "square" : rnd() < 0.72 ? "portrait" : "landscape";
    const [w, h] = SIZES[aspect];
    const tags = rnd() < 0.7 ? sample(TAGS, 1 + Math.floor(rnd() * 3)).map((t) => `#${t}`).join(" ") : "";
    const age = u === demo ? (i === 0 ? 2 * HOUR : (2 + rnd() * 58) * DAY) : rnd() ** 1.4 * 120 * DAY + 20 * 60_000;
    posts.push({
      id: faker.string.uuid(), user_id: u.id, author: u,
      image: `https://picsum.photos/seed/${faker.string.alphanumeric(10)}/${w}/${h}`,
      caption: [pick(CAPTIONS), tags].filter(Boolean).join(" "),
      alt: "", filter: rnd() < 0.6 ? "normal" : pick(FILTERS.slice(1)).id, aspect, created_at: ago(age),
      kind: "photo", video: "", music: rnd() < 0.35 ? pick(TRACKS).id : "", views: 0,
    });
  }

  // Reels: the 14 short videos in public/media/reels, by the demo account and the 13 most popular people.
  const reelFiles = sample([...Array(14).keys()].map((i) => `/media/reels/reel-${String(i + 1).padStart(2, "0")}`), 14);
  const reelAuthors = [demo, ...[...people].sort((a, b) => b.pop - a.pop).slice(0, 13)];
  for (const [i, u] of reelAuthors.entries()) {
    const tags = sample(TAGS, 1 + Math.floor(rnd() * 2)).map((t) => `#${t}`).join(" ");
    posts.push({
      id: faker.string.uuid(), user_id: u.id, author: u, kind: "reel",
      image: `${reelFiles[i]}.jpg`, video: `${reelFiles[i]}.mp4`, music: rnd() < 0.85 ? pick(TRACKS).id : "",
      caption: `${REEL_CAPTIONS[i]} ${tags}`, alt: "", filter: "normal", aspect: "vertical",
      views: Math.round(800 + rnd() ** 3 * 250_000), created_at: ago(u === demo ? 3 * DAY : rnd() ** 1.3 * 45 * DAY + HOUR),
    });
  }

  // Likes and comments arrive after a post goes up, mostly soon after.
  const likes = [];
  const comments = [];
  for (const p of posts) {
    const share = Math.min(0.95, 0.05 + 0.55 * rnd() ** 2 + 0.3 * p.author.pop + (p.kind === "reel" ? 0.3 : 0));
    const likers = sample(users.filter((u) => u !== p.author && u !== demo), Math.round(share * (userCount - 2)));
    if (p.author !== demo && followSet.has(`${demo.id} ${p.author.id}`) && rnd() < 0.3) likers.push(demo);
    for (const u of likers) likes.push({ post_id: p.id, user_id: u.id, created_at: between(p.created_at, Math.min(+now, +p.created_at + (rnd() < 0.8 ? 6 * HOUR : 20 * DAY))) });
    const commentCount = p.author === demo ? 3 + Math.floor(rnd() * 5) : Math.floor(rnd() ** 2.2 * 12);
    for (const u of sample(people.filter((x) => x !== p.author), commentCount)) {
      comments.push({ id: faker.string.uuid(), post_id: p.id, user_id: u.id, body: pick(COMMENTS), created_at: between(p.created_at, Math.min(+now, +p.created_at + 2 * DAY)) });
    }
  }

  // The demo account has saved a handful of posts.
  const saves = sample(posts.filter((p) => p.author !== demo), 15).map((p) => ({ user_id: demo.id, post_id: p.id, created_at: between(p.created_at, now) }));

  // Stories (portrait, 24 hours) from 14 of the people the demo account follows.
  const stories = [];
  const followed = people.filter((u) => followSet.has(`${demo.id} ${u.id}`));
  for (const u of sample(followed, 14)) {
    const count = 1 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      stories.push({
        id: faker.string.uuid(), user_id: u.id, image: `https://picsum.photos/seed/${faker.string.alphanumeric(10)}/1080/1920`,
        music: rnd() < 0.55 ? pick(TRACKS).id : "", created_at: ago((1 + rnd() * 21) * HOUR),
      });
    }
  }

  // Reposts: people repost a few recent posts; three people reposted the demo account's posts.
  const reposts = [];
  const reposted = new Set();
  const addRepost = (p, u) => {
    if (p.author === u || reposted.has(`${p.id} ${u.id}`)) return;
    reposted.add(`${p.id} ${u.id}`);
    reposts.push({ post_id: p.id, user_id: u.id, created_at: between(p.created_at, now) });
  };
  const recent = posts.filter((p) => now - p.created_at < 30 * DAY);
  for (const u of people) for (const p of sample(recent, Math.floor(rnd() ** 2 * 5))) addRepost(p, u);
  for (const p of sample(recent.filter((x) => x.author !== demo), 3)) addRepost(p, demo);
  for (const p of posts.filter((x) => x.author === demo).slice(0, 3)) addRepost(p, pick(people));

  // Chats: the demo account talks with 7 people it follows; the three newest chats have unread messages.
  const messages = [];
  for (const [c, u] of sample(followed, 7).entries()) {
    const n = 3 + Math.floor(rnd() * 7);
    let t = +now - (1 + c * 0.8) * DAY;
    for (let k = 0; k < n; k++) {
      t += rnd() * 2 * HOUR + 60_000;
      const fromThem = k === n - 1 || rnd() < 0.5;
      const shared = rnd() < 0.15 ? pick(posts.filter((p) => p.author !== demo)) : null;
      const unread = fromThem && c < 3 && k >= n - 2;
      messages.push({
        id: faker.string.uuid(), sender_id: fromThem ? u.id : demo.id, recipient_id: fromThem ? demo.id : u.id,
        body: shared && rnd() < 0.5 ? "" : pick(LINES), post_id: shared?.id ?? null,
        created_at: new Date(t), read_at: unread ? null : new Date(Math.min(+now, t + 5 * 60_000)),
      });
    }
  }

  const strip = ({ pop, ...u }) => u;
  return {
    users: users.map(strip),
    posts: posts.map(({ author, ...p }) => p),
    likes, comments, saves, follows, stories, reposts, messages,
  };
}

/** Builds the demo data (hashing the demo password) and writes it to a store. */
export async function seedStore(store, options = {}) {
  const data = demoData({ ...options, demoHash: await hashPassword(DEMO.password) });
  await store.bulk(data);
  return data;
}

async function main() {
  const { connect, mysqlStore, resetTables } = await import("./store/mysql.mjs");
  const pool = await connect();
  try {
    if (process.argv.includes("--reset")) {
      await resetTables(pool);
      console.log("Deleted the app's tables.");
    } else {
      const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users");
      if (n > 0) {
        console.error(`The database already has ${n} accounts. Run \`npm run seed -- --reset\` to replace everything with the demo data.`);
        process.exitCode = 1;
        return;
      }
    }
    const data = await seedStore(mysqlStore(pool));
    const reels = data.posts.filter((p) => p.kind === "reel").length;
    console.log(`Added ${data.users.length} accounts, ${data.posts.length - reels} photos, ${reels} reels, ${data.likes.length} likes, ${data.comments.length} comments, ${data.reposts.length} reposts, ${data.stories.length} stories and ${data.messages.length} messages.`);
    console.log(`Log in as "${DEMO.username}" with the password "${DEMO.password}".`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
