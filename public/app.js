// Makes the server-rendered pages instant. Everything here also works without JavaScript through
// plain links and forms; this script only takes over when it runs:
// likes and double-tap, saves, reposts, follows, comments, the share sheet, infinite scroll, post pop-ups,
// live search, video and music playback, the story player, the composer, live messages,
// light/dark switching and keyboard shortcuts.
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const on = (type, selector, handler, options) =>
    document.addEventListener(type, (e) => {
      const el = e.target.closest?.(selector);
      if (el) handler(e, el);
    }, options);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wide = () => innerWidth >= 768;

  const count = (n) => Number(n).toLocaleString("en-US");
  const plural = (n, word) => `${count(n)} ${n === 1 ? word : `${word}s`}`;
  const compact = (n) => (n < 10_000 ? count(n) : n < 1e6 ? `${Math.floor(n / 100) / 10}K` : `${Math.floor(n / 1e5) / 10}M`);

  // ---- Messages ----------------------------------------------------------------------------
  const toastEl = $("[data-toast]");
  let toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }
  if (document.body.dataset.flash) setTimeout(() => toast(document.body.dataset.flash), 150);

  /** A request answered with JSON. Logged-out people are sent to the login page. */
  async function send(url, method, body) {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(body && { "Content-Type": "application/x-www-form-urlencoded" }) },
      body: body && new URLSearchParams(body),
    });
    if (res.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new Error("login");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    return data;
  }
  const fail = (err) => err.message !== "login" && toast(err.message);
  const copiesOf = (id) => $$(`[data-post="${CSS.escape(id)}"]`); // a post can be in the feed and the pop-up at once

  // ---- Likes, double-tap and saves -----------------------------------------------------------------
  function setLiked(id, liked, likeCount) {
    for (const post of copiesOf(id)) {
      const button = $("[data-like]", post);
      if (!button) continue;
      button.classList.toggle("on", liked);
      button.setAttribute("aria-pressed", liked);
      button.form.action = `/p/${id}/like${liked ? "?_method=DELETE" : ""}`;
      if (likeCount == null) continue;
      for (const el of $$("[data-like-count]", post)) el.textContent = plural(likeCount, "like");
      for (const el of $$("[data-like-number]", post)) el.textContent = compact(likeCount);
    }
  }
  async function toggleLike(post, want) {
    const button = $("[data-like]", post);
    if (!button) return;
    const id = post.dataset.post;
    const liked = button.classList.contains("on");
    want ??= !liked;
    if (want === liked) return;
    const countEl = $("[data-like-count]", post);
    const before = countEl ? Number.parseInt(countEl.textContent.replace(/\D/g, ""), 10) || 0 : null;
    setLiked(id, want, before == null ? null : before + (want ? 1 : -1));
    if (want && !reduceMotion) {
      button.classList.remove("pop");
      void button.offsetWidth;
      button.classList.add("pop");
    }
    try {
      const data = await send(`/p/${id}/like`, want ? "POST" : "DELETE");
      setLiked(id, data.liked, data.like_count);
    } catch (err) {
      setLiked(id, liked, before);
      fail(err);
    }
  }
  on("click", "[data-like]", (e, button) => {
    e.preventDefault();
    toggleLike(button.closest("[data-post]"));
  });

  let lastBurst = 0;
  function doubleTap(media) {
    const post = media.closest("[data-post]");
    if (!post || Date.now() - lastBurst < 400) return;
    lastBurst = Date.now();
    const burst = $(".burst", media);
    if (burst && !reduceMotion) {
      burst.classList.remove("go");
      void burst.offsetWidth;
      burst.classList.add("go");
    }
    toggleLike(post, true);
  }
  on("dblclick", "[data-like-target]", (e, media) => doubleTap(media));
  let lastTap = 0;
  on("touchend", "[data-like-target]", (e, media) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      e.preventDefault();
      doubleTap(media);
      lastTap = 0;
    } else lastTap = now;
  });

  on("click", "[data-save]", async (e, button) => {
    e.preventDefault();
    const id = button.closest("[data-post]").dataset.post;
    const saved = button.classList.contains("on");
    const apply = (value) => {
      for (const post of copiesOf(id)) {
        const b = $("[data-save]", post);
        b.classList.toggle("on", value);
        b.setAttribute("aria-pressed", value);
        b.form.action = `/p/${id}/save${value ? "?_method=DELETE" : ""}`;
      }
    };
    apply(!saved);
    try {
      await send(`/p/${id}/save`, saved ? "DELETE" : "POST");
      toast(saved ? "Removed from your saved posts." : "Saved. Only you can see your saved posts.");
    } catch (err) {
      apply(saved);
      fail(err);
    }
  });

  // Reposts share someone else's post with your followers (and on your profile's Reposts tab).
  on("click", "[data-repost]", async (e, button) => {
    e.preventDefault();
    const id = button.closest("[data-post]").dataset.post;
    const reposted = button.classList.contains("on");
    const apply = (value, total) => {
      for (const post of copiesOf(id)) {
        const b = $("[data-repost]", post);
        if (!b) continue;
        b.classList.toggle("on", value);
        b.setAttribute("aria-pressed", value);
        b.form.action = `/p/${id}/repost${value ? "?_method=DELETE" : ""}`;
        if (total == null) continue;
        for (const el of $$("[data-repost-number]", post)) el.textContent = compact(total);
        for (const el of $$("[data-repost-count]", post)) el.textContent = plural(total, "repost");
      }
    };
    apply(!reposted);
    if (!reposted && !reduceMotion) {
      button.classList.remove("pop");
      void button.offsetWidth;
      button.classList.add("pop");
    }
    try {
      const data = await send(`/p/${id}/repost`, reposted ? "DELETE" : "POST");
      apply(data.reposted, data.repost_count);
      toast(data.reposted ? "Reposted. Your followers will see it in their feed." : "Repost removed.");
    } catch (err) {
      apply(reposted);
      fail(err);
    }
  });

  // ---- Follows --------------------------------------------------------------------------------------
  function setFollowing(button, following) {
    button.setAttribute("aria-pressed", following);
    button.classList.toggle("on", following);
    if (button.dataset.variant === "btn") button.classList.toggle("btn-secondary", following);
    button.textContent = following ? "Following" : "Follow";
    button.form.action = `/${button.dataset.follow}/follow${following ? "?_method=DELETE" : ""}`;
  }
  on("click", "[data-follow]", async (e, button) => {
    e.preventDefault();
    const username = button.dataset.follow;
    const following = button.getAttribute("aria-pressed") === "true";
    if (following && !confirm(`Unfollow @${username}?`)) return;
    button.disabled = true;
    try {
      const data = await send(`/${username}/follow`, following ? "DELETE" : "POST");
      for (const b of $$(`[data-follow="${CSS.escape(username)}"]`)) setFollowing(b, data.following);
      const followers = $("[data-followers]");
      if (followers && $(".ph-username")?.textContent === username) followers.textContent = compact(data.followers);
    } catch (err) {
      fail(err);
    } finally {
      button.disabled = false;
    }
  });

  // ---- Comments ------------------------------------------------------------------------------------------
  on("submit", "[data-comment-form]", async (e, form) => {
    e.preventDefault();
    const input = form.elements.body;
    const body = input.value.trim();
    if (!body) return;
    const post = form.closest("[data-post]");
    input.disabled = true;
    try {
      const data = await send(form.action, "POST", { body });
      input.value = "";
      const list = $("[data-comments]", post);
      if (list) {
        $("[data-no-comments]", list)?.remove();
        list.insertAdjacentHTML("beforeend", data.html);
        list.lastElementChild.classList.add("new");
        list.scrollTop = list.scrollHeight;
      } else {
        // In the feed, show the new comment under the caption, the way Instagram does.
        const template = document.createElement("template");
        template.innerHTML = data.html.trim();
        $("[data-new-comments]", post)?.append($(".comment-body p", template.content));
      }
      for (const copy of copiesOf(post.dataset.post)) {
        const link = $("[data-comment-total]", copy);
        if (link) link.textContent = data.comment_count === 1 ? "View 1 comment" : `View all ${count(data.comment_count)} comments`;
      }
    } catch (err) {
      fail(err);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  on("submit", "[data-delete-comment]", async (e, form) => {
    e.preventDefault();
    if (!confirm("Delete this comment?")) return;
    try {
      await send(form.action, "DELETE");
      form.closest("[data-comment]").remove();
      toast("Comment deleted.");
    } catch (err) {
      fail(err);
    }
  });

  on("submit", "form[data-confirm]", (e, form) => {
    if (!confirm(form.dataset.confirm)) e.preventDefault();
  });

  // ---- Sharing, menus, captions, dialogs --------------------------------------------------------------------
  async function shareLink(path, copyOnly) {
    const url = new URL(path, location.origin).href;
    if (!copyOnly && navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied to clipboard.");
    } catch {
      prompt("Copy this link:", url);
    }
  }
  on("click", "[data-share]", (e, el) => {
    e.preventDefault();
    shareLink(el.dataset.share, false);
  });
  on("click", "[data-copy]", (e, el) => {
    e.preventDefault();
    el.closest("details")?.removeAttribute("open");
    shareLink(el.dataset.copy, true);
  });

  document.addEventListener("click", (e) => {
    for (const menu of $$("details.menu[open]")) if (!menu.contains(e.target)) menu.removeAttribute("open");
  });

  on("click", "[data-more]", (e, more) => {
    e.preventDefault();
    more.previousElementSibling?.classList.remove("clamped");
    more.remove();
  });
  /** Removes "more" from captions that turned out short enough to show in full. */
  function trimCaptions(root = document) {
    for (const more of $$("[data-more]", root)) {
      const caption = more.previousElementSibling;
      if (caption && caption.scrollHeight <= caption.clientHeight + 1) {
        caption.classList.remove("clamped");
        more.remove();
      }
    }
  }

  on("click", "[data-open]", (e, el) => {
    el.closest("details")?.removeAttribute("open");
    document.getElementById(el.dataset.open)?.showModal();
  });

  for (const button of $$("[data-show-password]")) {
    const input = button.parentElement.querySelector("input");
    const sync = () => (button.hidden = !input.value);
    input.addEventListener("input", sync);
    sync();
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
    });
  }

  for (const field of $$("[data-count]")) {
    const out = $(`[data-count-of="${field.id}"]`);
    if (!out) continue;
    const sync = () => (out.textContent = count([...field.value].length));
    field.addEventListener("input", sync);
    sync();
  }

  // ---- Appearance ----------------------------------------------------------------------------------------------
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme === "dark" || (root.dataset.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const theme = dark ? "light" : "dark";
    root.dataset.theme = theme;
    for (const input of $$("[data-theme-toggle] input[name=theme]")) input.value = dark ? "dark" : "light";
    send("/appearance", "POST", { theme }).catch(() => {});
    toast(dark ? "Light mode on." : "Dark mode on.");
  }
  on("submit", "[data-theme-toggle]", (e, form) => {
    e.preventDefault();
    form.closest("details")?.removeAttribute("open");
    toggleTheme();
  });

  // ---- Search: the slide-out panel and live results ------------------------------------------------------------------
  const panel = $("#search-panel");
  if (panel) panel.hidden = false;
  function setPanel(open) {
    document.body.classList.toggle("panel-open", open);
    if (open) setTimeout(() => $("input", panel).focus(), 60);
  }
  on("click", "[data-panel]", (e) => {
    if (!panel || !wide()) return;
    e.preventDefault();
    setPanel(!document.body.classList.contains("panel-open"));
  });
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("panel-open") && !panel.contains(e.target) && !e.target.closest("[data-panel]")) setPanel(false);
  });

  for (const form of $$("[data-live-search]")) {
    const input = $("input", form);
    const results = form.nextElementSibling;
    let timer;
    let latest = 0;
    form.addEventListener("submit", (e) => {
      if (panel?.contains(form)) return; // the panel's form opens the full search page
      e.preventDefault();
    });
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        const ticket = ++latest;
        const res = await fetch(`/search?fragment=1&q=${encodeURIComponent(q)}`, { credentials: "same-origin" });
        if (ticket !== latest) return; // a newer search already answered
        results.innerHTML = await res.text();
        if (!panel?.contains(form)) history.replaceState(null, "", q ? `/search?q=${encodeURIComponent(q)}` : "/search");
      }, 160);
    });
  }

  // ---- Infinite scroll -----------------------------------------------------------------------------------------------
  const watcher = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => en.isIntersecting && loadMore(en.target)), { rootMargin: "900px 0px" })
    : null;
  const watchMore = () => $$("[data-next]").forEach((link) => watcher?.observe(link));
  async function loadMore(link) {
    if (link.classList.contains("loading")) return;
    watcher?.unobserve(link);
    link.classList.add("loading");
    try {
      const url = new URL(link.href);
      url.searchParams.set("fragment", "1");
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.statusText);
      const template = document.createElement("template");
      template.innerHTML = await res.text();
      const container = link.previousElementSibling;
      const items = $("[data-items]", template.content);
      container.append(...items.children);
      items.remove();
      link.replaceWith(template.content);
      trimCaptions(container);
      watchMore();
    } catch {
      link.classList.remove("loading"); // the link still works as a normal page link
    }
  }
  on("click", "[data-next]", (e, link) => {
    if (!watcher) return;
    e.preventDefault();
    loadMore(link);
  });

  // ---- Post pop-up (desktop): opens /p/:id over the page, with its own address ----------------------------
  const modal = $("#post-modal");
  const modalBody = modal && $("[data-modal-body]", modal);
  async function openPost(path, push) {
    const res = await fetch(path, { credentials: "same-origin" });
    const detail = res.ok && new DOMParser().parseFromString(await res.text(), "text/html").querySelector(".post-detail");
    if (!detail) {
      location.href = path;
      return;
    }
    modalBody.replaceChildren(document.adoptNode(detail));
    if (!modal.open) modal.showModal();
    if (push) history.pushState({ modal: path }, "", path);
  }
  const plainClick = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  on("click", "[data-modal]", (e, link) => {
    const path = new URL(link.href).pathname;
    if (!modal || !wide() || !plainClick(e) || !/^\/p\/[\w-]+$/.test(path)) return;
    if (link.closest(".post-detail")?.dataset.post === path.slice(3)) return; // already showing this post
    e.preventDefault();
    openPost(path, !modal.open);
  });
  on("click", "[data-comment-link]", (e, link) => {
    const input = $("[data-comment-form] input", link.closest(".post-detail") ?? document.createElement("div"));
    if (input) {
      e.preventDefault();
      input.focus();
    } else if (modal && wide() && plainClick(e)) {
      e.preventDefault();
      openPost(new URL(link.href).pathname, true).then(() => $("[data-comment-form] input", modalBody)?.focus());
    }
  });
  if (modal) {
    modal.addEventListener("close", () => {
      modalBody.replaceChildren();
      if (history.state?.modal) history.back();
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target === modalBody || e.target.closest("[data-close]")) modal.close();
    });
    addEventListener("popstate", (e) => {
      if (e.state?.modal) openPost(e.state.modal, false);
      else if (modal.open) modal.close();
    });
  }

  // ---- Story tray arrows ----------------------------------------------------------------------------------------------
  const tray = $("[data-tray-list]");
  if (tray) {
    const back = $('[data-tray="-1"]');
    const next = $('[data-tray="1"]');
    const update = () => {
      back.hidden = tray.scrollLeft < 4;
      next.hidden = tray.scrollLeft + tray.clientWidth >= tray.scrollWidth - 4;
    };
    tray.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
    on("click", "[data-tray]", (e, button) => tray.scrollBy({ left: Number(button.dataset.tray) * tray.clientWidth * 0.8 }));
  }

  // ---- Login page: the phone cross-fades through popular photos --------------------------------------------------
  const shots = $$("[data-phone-shots] img");
  if (shots.length > 1 && !reduceMotion) {
    let shown = 0;
    setInterval(() => {
      shots[shown].classList.remove("on");
      shown = (shown + 1) % shots.length;
      shots[shown].classList.add("on");
    }, 4000);
  }

  // ---- Video and music: play what's on screen; sound is one switch for the whole site -----------------------------
  const prefs = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  let soundOn = prefs?.getItem("sound") === "on";
  const music = new Audio();
  music.loop = true;
  music.preload = "none";
  const preview = new Audio();
  let previewButton = null;
  let activeMedia = null;
  const visibleMedia = new Map();

  function syncSoundButtons() {
    for (const b of $$("[data-sound], [data-story-sound]")) {
      b.hidden = false;
      b.classList.toggle("on", soundOn);
      b.setAttribute("aria-label", soundOn ? "Mute" : "Turn sound on");
    }
  }
  function setSound(on) {
    soundOn = on;
    try {
      prefs?.setItem("sound", on ? "on" : "off");
    } catch {}
    syncSoundButtons();
  }
  /** Plays a music track (looping) if sound is on; browsers may block it until the person taps something. */
  function playMusic(src, restart = false) {
    if (!soundOn || !src) return music.pause();
    const url = new URL(src, location.href).href;
    if (music.src !== url) music.src = url;
    else if (restart) music.currentTime = 0;
    stopPreview();
    music.play().catch(() => setSound(false));
  }
  function applySound(restart = false) {
    const video = activeMedia && $("video", activeMedia);
    if (!activeMedia) return music.pause();
    if (activeMedia.dataset.music) {
      if (video) video.muted = true;
      playMusic(activeMedia.dataset.music, restart);
    } else {
      music.pause();
      if (video) video.muted = !soundOn;
    }
  }
  function activate(media) {
    if (media === activeMedia) return;
    $("video", activeMedia ?? document.createElement("div"))?.pause();
    activeMedia = media;
    $("video", media ?? document.createElement("div"))?.play().catch(() => {});
    applySound(true);
  }
  /** The most visible playing-kind media (a reel, or a post with music); inside the pop-up when it is open. */
  function pickMedia() {
    let best = null;
    let ratio = 0.6;
    for (const [el, r] of visibleMedia) {
      if (!el.isConnected || (modal?.open && !modal.contains(el))) continue;
      if (r >= ratio) [best, ratio] = [el, r];
    }
    activate(best);
  }
  const mediaWatcher = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? visibleMedia.set(e.target, e.intersectionRatio) : visibleMedia.delete(e.target);
      pickMedia();
    }, { threshold: [0, 0.6, 0.8, 1] })
    : null;
  const PLAYABLE = "[data-media][data-reel], [data-media][data-music]";
  function watchMedia(root) {
    const found = root.matches?.(PLAYABLE) ? [root] : $$(PLAYABLE, root);
    for (const media of found) {
      $("video", media)?.removeAttribute("controls"); // the page plays and pauses videos itself
      mediaWatcher?.observe(media);
    }
    if (found.length) syncSoundButtons();
  }
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) watchMedia(n);
    if (activeMedia && !activeMedia.isConnected) {
      visibleMedia.delete(activeMedia);
      activeMedia = null;
      pickMedia();
    }
  }).observe(document.body, { childList: true, subtree: true });

  on("click", "[data-sound]", (e, button) => {
    e.preventDefault();
    setSound(!soundOn);
    const media = button.closest("[data-media]");
    if (media !== activeMedia) activate(media);
    else applySound();
  });
  // Tapping a reel pauses it on the Reels page; in the feed it switches the sound, like Instagram.
  on("click", "[data-media][data-reel]", (e, media) => {
    if (e.target.closest("[data-sound]")) return;
    const video = $("video", media);
    if (media.closest(".reel")) {
      if (video.paused) {
        video.play().catch(() => {});
        applySound();
      } else {
        video.pause();
        music.pause();
      }
    } else {
      setSound(!soundOn);
      if (media !== activeMedia) activate(media);
      else applySound();
    }
  });
  // A play is counted once a reel has played for 2 seconds.
  const counted = new WeakSet();
  document.addEventListener("timeupdate", (e) => {
    const video = e.target;
    if (!(video instanceof HTMLVideoElement) || counted.has(video) || video.currentTime < 2) return;
    const post = video.closest("[data-post]");
    if (!post) return;
    counted.add(video);
    fetch(`/p/${post.dataset.post}/view`, { method: "POST", credentials: "same-origin" }).catch(() => {});
  }, true);

  // Music previews (the music picker and the audio page).
  function stopPreview() {
    preview.pause();
    previewButton?.classList.remove("playing");
    previewButton = null;
  }
  for (const b of $$("[data-preview][hidden]")) b.hidden = false;
  function playPreview(button) {
    stopPreview();
    music.pause();
    previewButton = button;
    preview.src = button.dataset.preview;
    preview.play().then(() => button.classList.add("playing")).catch(() => {});
  }
  preview.addEventListener("ended", stopPreview);
  on("click", "[data-preview]", (e, button) => {
    e.preventDefault();
    if (previewButton === button && !preview.paused) stopPreview();
    else playPreview(button);
  });

  // ---- Create and edit: drop a photo or video, preview it, try filters, shapes and music live ----------------------
  const composer = $("[data-composer]");
  if (composer) {
    const fileInput = $("[data-file]", composer);
    const posterInput = $("[data-poster]", composer);
    const stage = $(".stage", composer);
    const previewBox = $("[data-preview]", composer);
    const image = $("[data-preview-img]", composer);
    const video = $("[data-preview-video]", composer);
    const titles = { post: "Drag photos and videos here", reel: "Drag a video here", story: "Drag a photo here" };
    let objectUrl;
    const setKind = (kind) => {
      composer.dataset.kind = kind;
      $("[data-kind-label]", composer).textContent = kind;
      const radio = $(`[name=kind][value=${kind}]`, composer);
      if (radio) radio.checked = true;
      const title = $("[data-stage-title]", composer);
      if (title) title.textContent = titles[kind];
    };
    /** A still from the video becomes the reel's poster (sent as the "poster" file) and the filter previews. */
    async function capturePoster() {
      if (video.readyState < 2) await new Promise((r) => video.addEventListener("loadeddata", r, { once: true }));
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      await new Promise((r) => video.addEventListener("seeked", r, { once: true }));
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (!blob) return;
      const list = new DataTransfer();
      list.items.add(new File([blob], "poster.jpg", { type: "image/jpeg" }));
      posterInput.files = list.files;
      const still = URL.createObjectURL(blob);
      for (const thumb of $$("[data-filter-thumb]", composer)) thumb.src = still;
      video.play().catch(() => {});
    }
    const showFile = (file) => {
      const isVideo = file?.type.startsWith("video/");
      if (!file || !(isVideo || file.type.startsWith("image/"))) return toast("Choose a photo or a video.");
      if (isVideo && composer.dataset.kind === "story") return toast("Stories are photos. Choose Reel to share a video.");
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      previewBox.hidden = false;
      stage.classList.add("has-photo");
      image.hidden = isVideo;
      video.hidden = !isVideo;
      if (isVideo) {
        setKind("reel");
        video.src = objectUrl;
        capturePoster().catch(() => {});
      } else {
        if (composer.dataset.kind === "reel") setKind("post");
        posterInput.value = "";
        video.removeAttribute("src");
        image.src = objectUrl;
        for (const thumb of $$("[data-filter-thumb]", composer)) thumb.src = objectUrl;
      }
    };
    if (fileInput) {
      fileInput.addEventListener("change", () => showFile(fileInput.files[0]));
      stage.addEventListener("dragover", (e) => {
        e.preventDefault();
        stage.classList.add("over");
      });
      stage.addEventListener("dragleave", () => stage.classList.remove("over"));
      stage.addEventListener("drop", (e) => {
        e.preventDefault();
        stage.classList.remove("over");
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const list = new DataTransfer();
        list.items.add(file);
        fileInput.files = list.files;
        showFile(file);
      });
    }
    composer.addEventListener("change", (e) => {
      const { name, value } = e.target;
      if (name === "filter") for (const el of [image, video]) if (el) el.className = `f-${value}`;
      if (name === "aspect") previewBox.className = `stage-preview media ar-${value}`;
      if (name === "kind") setKind(value);
      if (name === "music") {
        $("[data-music-label]", composer).textContent = e.target.dataset.title;
        const button = e.target.closest(".track")?.querySelector("[data-preview]");
        if (button) playPreview(button);
        else stopPreview();
      }
    });
  }
  const avatarInput = $("[data-avatar-input]");
  avatarInput?.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (file) $("[data-avatar-preview]").src = URL.createObjectURL(file);
  });

  // ---- Share sheet: send a post to people in your chats, or copy its link -------------------------------------------
  const shareDialog = $("#share-sheet");
  const shareBody = shareDialog && $("[data-share-body]", shareDialog);
  on("click", "[data-share-sheet]", async (e, link) => {
    if (!shareDialog || !plainClick(e)) return;
    e.preventDefault();
    const res = await fetch(`/p/${link.dataset.shareSheet}/share?fragment=1`, { credentials: "same-origin" });
    if (!res.ok || new URL(res.url).pathname === "/login") {
      location.href = res.url;
      return;
    }
    shareBody.innerHTML = await res.text();
    shareDialog.showModal();
    $("[data-share-filter]", shareBody)?.focus();
  });
  on("input", "[data-share-filter]", (e, input) => {
    const q = input.value.trim().toLowerCase();
    for (const row of $$(".share-list li", input.closest(".share-sheet"))) row.hidden = Boolean(q) && !row.dataset.name.includes(q);
  });
  on("submit", "[data-share-send]", async (e, form) => {
    e.preventDefault();
    const button = $("button", form);
    button.disabled = true;
    try {
      await send(form.action, "POST", { to: form.elements.to.value });
      button.textContent = "Sent";
      button.classList.add("sent");
    } catch (err) {
      button.disabled = false;
      fail(err);
    }
  });
  on("click", "[data-close-share]", (e) => {
    if (!shareDialog?.open) return;
    e.preventDefault();
    shareDialog.close();
  });
  shareDialog?.addEventListener("click", (e) => e.target === shareDialog && shareDialog.close());

  // ---- Messages: send without reloading; new messages and "Seen" arrive live --------------------------------------
  const threadBody = $("[data-thread-body]");
  const threadUser = $("[data-thread]")?.dataset.thread;
  if (threadBody) threadBody.scrollTop = threadBody.scrollHeight;
  function setUnread(n) {
    for (const badge of $$("[data-unread-badge]")) {
      badge.hidden = !n;
      badge.textContent = n > 9 ? "9+" : String(n || "");
    }
  }
  function appendMessage(html) {
    const seen = $("[data-seen]", threadBody);
    seen.insertAdjacentHTML("beforebegin", html);
    seen.previousElementSibling.classList.add("new");
    seen.hidden = true;
    threadBody.scrollTop = threadBody.scrollHeight;
  }
  function updateChat(username, text, unread) {
    const row = $(`[data-chat="${CSS.escape(username)}"]`);
    if (!row) return;
    $("[data-chat-preview]", row).textContent = text;
    row.classList.toggle("unread", unread);
    row.closest("ul").prepend(row.closest("li"));
  }
  const previewOf = (html) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return $(".bubble", template.content)?.textContent.trim() || "Sent a post";
  };
  on("submit", "[data-message-form]", async (e, form) => {
    e.preventDefault();
    const input = form.elements.body;
    const body = input.value.trim();
    if (!body) return;
    input.value = "";
    try {
      const data = await send(form.action, "POST", { body });
      appendMessage(data.html);
      updateChat(threadUser, `You: ${body}`, false);
    } catch (err) {
      input.value = body;
      fail(err);
    }
  });
  if ($("[data-me]") && "EventSource" in window) {
    const events = new EventSource("/direct/events");
    events.addEventListener("message", (e) => {
      const data = JSON.parse(e.data);
      if (data.from === threadUser) {
        appendMessage(data.html);
        updateChat(data.from, previewOf(data.html), false);
        send(`/direct/t/${data.from}/read`, "POST").then((r) => setUnread(r.unread)).catch(() => {});
      } else {
        setUnread(data.unread);
        updateChat(data.from, previewOf(data.html), true);
        toast(`${data.name || data.from}: ${previewOf(data.html)}`);
      }
    });
    events.addEventListener("read", (e) => {
      if (JSON.parse(e.data).by !== threadUser) return;
      if ($$(".msg", threadBody).at(-1)?.classList.contains("mine")) $("[data-seen]", threadBody).hidden = false;
    });
    addEventListener("pagehide", () => events.close());
  }

  // ---- Story player: 5 seconds a story, tap the sides to skip, hold to pause, music if the story has it ----------
  const stories = $("[data-stories]");
  if (stories) storyPlayer(stories);

  function storyPlayer(stage) {
    const DURATION = 5000;
    const slides = $$(".slide", stage);
    const bars = $$(".bar", stage);
    const time = $("[data-story-time]", stage);
    const musicLine = $("[data-story-music]", stage);
    const soundButton = $("[data-story-sound]", stage);
    const seen = new Set();
    let index = 0;
    let startedAt = 0;
    let elapsed = 0;
    let paused = false;
    let leaving = false;

    if (slides.some((s) => s.dataset.music)) syncSoundButtons();
    else soundButton.remove();
    const leave = (url) => {
      leaving = true;
      music.pause();
      location.href = url;
    };
    function storyMusic(restart) {
      const slide = slides[index];
      musicLine.hidden = !slide.dataset.music;
      $("span", musicLine).textContent = slide.dataset.musicTitle ?? "";
      if (slide.dataset.music && !paused) playMusic(slide.dataset.music, restart);
      else music.pause();
    }
    function show(n) {
      if (leaving) return;
      if (n < 0) return stage.dataset.prevUser ? leave(stage.dataset.prevUser) : show(0);
      if (n >= slides.length) return leave(stage.dataset.nextUser || stage.dataset.exit);
      index = n;
      slides.forEach((s, k) => s.classList.toggle("on", k === n));
      bars.forEach((bar, k) => {
        bar.classList.toggle("done", k < n);
        $("i", bar).style.transform = k < n ? "none" : "scaleX(0)";
      });
      time.textContent = slides[n].dataset.time;
      elapsed = 0;
      startedAt = performance.now();
      storyMusic(true);
      const id = slides[n].dataset.id;
      if (stage.dataset.viewer && !seen.has(id)) {
        seen.add(id);
        fetch(`/stories/${id}/seen`, { method: "POST", credentials: "same-origin" }).catch(() => {});
      }
    }
    function pause(value) {
      if (value === paused) return;
      if (value) elapsed += performance.now() - startedAt;
      else startedAt = performance.now();
      paused = value;
      stage.classList.toggle("paused", value);
      storyMusic(false);
    }
    function frame(now) {
      if (!paused && !leaving) {
        const progress = Math.min(1, (elapsed + now - startedAt) / DURATION);
        $("i", bars[index]).style.transform = `scaleX(${progress})`;
        if (progress >= 1) show(index + 1);
      }
      if (!leaving) requestAnimationFrame(frame);
    }

    on("click", "[data-story-next]", () => show(index + 1));
    on("click", "[data-story-back]", () => show(index - 1));
    on("click", "[data-story-pause]", () => pause(!paused));
    on("click", "[data-story-sound]", () => {
      setSound(!soundOn);
      storyMusic(false);
    });
    // Holding a finger (or the mouse) on the story pauses it; letting go carries on.
    const story = $(".story", stage);
    let holdTimer;
    let held = false;
    story.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".story-head")) return;
      held = false;
      holdTimer = setTimeout(() => {
        held = true;
        pause(true);
      }, 220);
    });
    const release = () => {
      clearTimeout(holdTimer);
      if (held) pause(false);
    };
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) story.addEventListener(type, release);
    story.addEventListener("click", (e) => {
      if (!held) return;
      held = false;
      e.stopPropagation();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(index + 1);
      else if (e.key === "ArrowLeft") show(index - 1);
      else if (e.key === " ") {
        e.preventDefault();
        pause(!paused);
      } else if (e.key === "m") {
        setSound(!soundOn);
        storyMusic(false);
      } else if (e.key === "Escape") leave(stage.dataset.exit);
    });
    document.addEventListener("visibilitychange", () => pause(document.hidden));
    show(Number(stage.dataset.start) || 0);
    requestAnimationFrame(frame);
  }

  // ---- Keyboard shortcuts (press ? for the list) ----------------------------------------------------------------
  const ITEMS = ".post, .reel";
  /** The post the keys act on: the pop-up's, the highlighted one, or the first one on screen. */
  function currentPost() {
    if (modal?.open) return $(".post-detail", modal);
    return $(".post.current, .reel.current") || $$(ITEMS).find((p) => p.getBoundingClientRect().bottom > 100) || $(".post-detail");
  }
  function move(direction) {
    const items = $$(ITEMS);
    if (!items.length) return;
    const current = $(".post.current, .reel.current");
    let at = items.indexOf(current);
    if (at < 0) {
      const visible = items.findIndex((p) => p.getBoundingClientRect().bottom > 100);
      at = visible < 0 ? items.length : visible - (direction > 0 ? 1 : 0);
    }
    const target = items[Math.max(0, Math.min(items.length - 1, at + direction))];
    current?.classList.remove("current");
    target.classList.add("current");
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }
  let goKey = 0;
  document.addEventListener("keydown", (e) => {
    if (stories || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target;
    if (el.matches?.("input, textarea, select, [contenteditable]")) {
      if (e.key === "Escape") el.blur();
      return;
    }
    if ($("dialog[open]") && !modal?.open) return;
    if (e.key === "Escape" && document.body.classList.contains("panel-open")) return setPanel(false);
    if (goKey && Date.now() - goKey < 1200) {
      goKey = 0;
      const destination = { h: "/", e: "/explore", r: "/reels", d: "/direct/inbox", a: "/activity", p: $("[data-me]")?.getAttribute("href") }[e.key];
      if (destination) location.href = destination;
      return;
    }
    const post = () => currentPost();
    switch (e.key) {
      case "g":
        goKey = Date.now();
        break;
      case "j":
      case "k":
        if (!modal?.open) move(e.key === "j" ? 1 : -1);
        break;
      case "l":
        if (post()) toggleLike(post());
        break;
      case "s":
        $("[data-save]", post() ?? document.body)?.click();
        break;
      case "r":
        $("[data-repost]", post() ?? document.body)?.click();
        break;
      case "m":
        setSound(!soundOn);
        applySound();
        break;
      case "c": {
        const p = post();
        const input = p && $("[data-comment-form] input", p);
        if (input) {
          e.preventDefault();
          input.focus();
        }
        break;
      }
      case "o": {
        const p = post();
        if (p?.matches(ITEMS)) {
          if (modal && wide()) openPost(`/p/${p.dataset.post}`, true);
          else location.href = `/p/${p.dataset.post}`;
        }
        break;
      }
      case "/":
        e.preventDefault();
        if (panel && wide()) setPanel(true);
        else location.href = "/search";
        break;
      case "n":
        location.href = "/create";
        break;
      case "t":
        toggleTheme();
        break;
      case "?":
        $("#shortcuts")?.showModal();
        break;
    }
  });

  trimCaptions();
  watchMore();
  watchMedia(document.body);
})();
