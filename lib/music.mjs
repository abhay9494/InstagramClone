// The music library people can add to posts, reels and stories. The tracks are short original
// instrumental loops kept in public/media/music; a post stores only the track's id.

export const TRACKS = [
  { id: "golden-hour", title: "Golden Hour", artist: "Saffron Skies", colors: ["#f9a825", "#ef6c00"], seconds: 26 },
  { id: "night-drive", title: "Night Drive", artist: "Neon Harbor", colors: ["#6a1b9a", "#1a237e"], seconds: 25 },
  { id: "coffee-and-rain", title: "Coffee & Rain", artist: "Lo-Fi Lantern", colors: ["#6d4c41", "#455a64"], seconds: 28 },
  { id: "sunrise-run", title: "Sunrise Run", artist: "Kavi Rao", colors: ["#ff7043", "#ffca28"], seconds: 25 },
  { id: "paper-boats", title: "Paper Boats", artist: "The Quiet Rooms", colors: ["#26a69a", "#b2dfdb"], seconds: 26 },
  { id: "city-lights", title: "City Lights", artist: "Mira & the Metro", colors: ["#d81b60", "#5e35b1"], seconds: 25 },
  { id: "ocean-breeze", title: "Ocean Breeze", artist: "Tidewater", colors: ["#039be5", "#00bfa5"], seconds: 24 },
  { id: "stardust", title: "Stardust", artist: "Polar Echo", colors: ["#283593", "#0d0d0d"], seconds: 25 },
];
const BY_ID = new Map(TRACKS.map((t) => [t.id, t]));

/** The track with this id, or null (also for "", the "no music" choice). */
export const trackOf = (id) => BY_ID.get(id) ?? null;
export const trackUrl = (track) => `/media/music/${track.id}.mp3`;

/** Album-art gradients, one class per track (served with the filters at /catalog.css). */
export const coversCss = () =>
  TRACKS.map((t) => `.cover-${t.id}{background:linear-gradient(135deg,${t.colors[0]},${t.colors[1]})}`).join("\n") + "\n";
