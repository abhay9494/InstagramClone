// Where uploaded images end up: on Imgur when IMGUR_CLIENT_ID is set (the URL is stored in MySQL),
// otherwise in public/uploads on this server.
import { readFile, unlink } from "node:fs/promises";

export function imageStore({ clientId = "", fetchImpl = fetch } = {}) {
  return async (file) => {
    if (!clientId) return `/uploads/${file.filename}`;
    const form = new FormData();
    form.append("image", (await readFile(file.path)).toString("base64"));
    form.append("type", "base64");
    const res = await fetchImpl("https://api.imgur.com/3/image", {
      method: "POST",
      headers: { Authorization: `Client-ID ${clientId}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(`Imgur upload failed (HTTP ${res.status})`);
    await unlink(file.path).catch(() => {}); // the image lives on Imgur now
    return data.data.link;
  };
}
