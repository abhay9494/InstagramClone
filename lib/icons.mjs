// The interface icons, drawn on a 24×24 grid as outlines (and a few filled versions for "on" states).
// icon("heart") returns inline SVG; the views call it through app.locals.

const PATHS = {
  home: '<path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6.4H9.2V21H4a1 1 0 0 1-1-1z"/>',
  "home-on": '<path fill="currentColor" d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6.4H9.2V21H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.3 16.3 4.9 4.9"/>',
  explore: '<circle cx="12" cy="12" r="9.2"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z"/>',
  "explore-on": '<circle cx="12" cy="12" r="9.2" fill="currentColor"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z" fill="var(--bg)" stroke="var(--bg)"/>',
  heart: '<path d="M12 20.6s-7.6-4.5-9.4-9.4C1.2 7.4 3.6 3.9 7.2 3.9c2.1 0 3.6 1.1 4.8 2.8 1.2-1.7 2.7-2.8 4.8-2.8 3.6 0 6 3.5 4.6 7.3-1.8 4.9-9.4 9.4-9.4 9.4z"/>',
  "heart-on": '<path fill="currentColor" d="M12 20.6s-7.6-4.5-9.4-9.4C1.2 7.4 3.6 3.9 7.2 3.9c2.1 0 3.6 1.1 4.8 2.8 1.2-1.7 2.7-2.8 4.8-2.8 3.6 0 6 3.5 4.6 7.3-1.8 4.9-9.4 9.4-9.4 9.4z"/>',
  comment: '<path d="M20.4 16.5A9.2 9.2 0 1 0 17 20.1l4 .9z"/>',
  "comment-on": '<path fill="currentColor" d="M20.4 16.5A9.2 9.2 0 1 0 17 20.1l4 .9z"/>',
  glyph: '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5.4"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/>',
  share: '<path d="M21.5 2.5 10 13.2"/><path d="M21.5 2.5 14.6 21l-4.6-7.8L2.5 8.5z"/>',
  save: '<path d="M19 21.2 12 15.4l-7 5.8V3.8A1 1 0 0 1 6 2.8h12a1 1 0 0 1 1 1z"/>',
  "save-on": '<path fill="currentColor" d="M19 21.2 12 15.4l-7 5.8V3.8A1 1 0 0 1 6 2.8h12a1 1 0 0 1 1 1z"/>',
  create: '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5"/><path d="M12 7.6v8.8M7.6 12h8.8"/>',
  "create-on": '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5" fill="currentColor"/><path d="M12 7.6v8.8M7.6 12h8.8" stroke="var(--bg)"/>',
  reels: '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5"/><path d="M2.8 8.3h18.4M8.2 2.9l3 5.4M14.4 2.9l3 5.4"/><path d="m10 11.6 4.8 2.8-4.8 2.8z"/>',
  "reels-on": '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5" fill="currentColor"/><path d="M2.8 8.3h18.4M8.2 2.9l3 5.4M14.4 2.9l3 5.4" stroke="var(--bg)"/><path d="m10 11.6 4.8 2.8-4.8 2.8z" fill="var(--bg)" stroke="var(--bg)"/>',
  direct: '<path d="M12 2.8c-5.2 0-9.2 3.8-9.2 8.8 0 2.7 1.1 5 3 6.6v3l2.9-1.6c1 .3 2.1.5 3.3.5 5.2 0 9.2-3.8 9.2-8.5S17.2 2.8 12 2.8z"/><path d="m6.8 14.3 3.5-3.7 2.3 1.9 4.6-2.6-3.5 3.7-2.3-1.9z"/>',
  "direct-on": '<path fill="currentColor" d="M12 2.8c-5.2 0-9.2 3.8-9.2 8.8 0 2.7 1.1 5 3 6.6v3l2.9-1.6c1 .3 2.1.5 3.3.5 5.2 0 9.2-3.8 9.2-8.5S17.2 2.8 12 2.8z"/><path d="m6.8 14.3 3.5-3.7 2.3 1.9 4.6-2.6-3.5 3.7-2.3-1.9z" fill="var(--bg)" stroke="var(--bg)"/>',
  repost: '<path d="M16.6 2.8 20 6.2l-3.4 3.4"/><path d="M4 11.2V9.8a3.6 3.6 0 0 1 3.6-3.6H20"/><path d="M7.4 21.2 4 17.8l3.4-3.4"/><path d="M20 12.8v1.4a3.6 3.6 0 0 1-3.6 3.6H4"/>',
  music: '<path d="M9 18.2V5.6l11-2.1v12.2"/><circle cx="6.4" cy="18.2" r="2.6"/><circle cx="17.4" cy="15.7" r="2.6"/>',
  "sound-on": '<path d="M3.8 9.4h3.6L12 5.6v12.8l-4.6-3.8H3.8z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  "sound-off": '<path d="M3.8 9.4h3.6L12 5.6v12.8l-4.6-3.8H3.8z"/><path d="m16 9.6 4.8 4.8M20.8 9.6 16 14.4"/>',
  menu: '<path d="M3.5 5.5h17M3.5 12h17M3.5 18.5h17"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  close: '<path d="M18.5 5.5 5.5 18.5M5.5 5.5l13 13"/>',
  back: '<path d="M15 19 8 12l7-7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  moon: '<path d="M20.5 13.6A8.6 8.6 0 1 1 10.4 3.5a6.8 6.8 0 0 0 10.1 10.1z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  keyboard: '<rect x="2" y="5.5" width="20" height="13" rx="2.5"/><path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M18 9.5h.01M7.5 14.5h9"/>',
  logout: '<path d="M9.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5M16 16.5l4.5-4.5L16 7.5M20.5 12H9.5"/>',
  photo: '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="4"/><circle cx="8.6" cy="8.6" r="1.8"/><path d="m21.2 15.4-5.1-5.1L4.3 21.1"/>',
  trash: '<path d="M4 6.5h16M9.5 6.5V4.2h5v2.3M6.3 6.5l.9 13.4a1.2 1.2 0 0 0 1.2 1.1h7.2a1.2 1.2 0 0 0 1.2-1.1l.9-13.4M10 10.5v6.5M14 10.5v6.5"/>',
  edit: '<path d="M4 20h4.2L19.4 8.8a2.1 2.1 0 0 0 0-3L18.2 4.6a2.1 2.1 0 0 0-3 0L4 15.8z"/><path d="m13.8 6 4.2 4.2"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path fill="currentColor" d="M7 4.5v15l12.5-7.5z"/>',
  user: '<circle cx="12" cy="8.2" r="4.2"/><path d="M4 21c.8-4.1 4-6.4 8-6.4s7.2 2.3 8 6.4"/>',
  check: '<path d="m4.5 12.5 4.8 4.8 10.2-10.6"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16.5-4.6-4.6L7.5 19.5"/>',
};

export function icon(name, { size = 24, label = "", className = "" } = {}) {
  const body = PATHS[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" focusable="false" ${a11y}>${body}</svg>`;
}
