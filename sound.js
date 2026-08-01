// What was playing while the frames were made. The line is text — a name and a
// control, set like the rest of the page — and nothing is fetched from YouTube
// until the reader presses play. Before that press the page has spoken to no
// one but this site; that is the whole point of loading it late.
//
// Stopping removes the frame rather than pausing it, because pausing would
// need YouTube's own script on the page, and it is not worth it.

import { t } from "./i18n.js";
import { text } from "./site-utils.js";

const EMBED = "https://www.youtube-nocookie.com/embed/";

export function mountSound(root = document) {
  for (const slot of root.querySelectorAll(".sound-slot")) {
    if (slot.dataset.soundReady === "true") {
      continue;
    }
    slot.dataset.soundReady = "true";
    const video = videoId(text(slot.dataset.soundUrl, ""));
    if (video === "") {
      continue;
    }
    slot.append(player(slot, video));
  }
}

function player(slot, video) {
  const wrap = document.createElement("div");
  wrap.className = "sound";

  const line = document.createElement("p");
  line.className = "sound-line";

  const label = document.createElement("span");
  label.className = "sound-name";
  label.textContent = `${t("sound.label")}: ${text(slot.dataset.soundLabel, video)}`;

  const control = document.createElement("button");
  control.type = "button";
  control.className = "sound-button";
  control.textContent = `▶ ${t("sound.play")}`;

  const notice = document.createElement("span");
  notice.className = "sound-notice";
  notice.dataset.i18n = "sound.notice";
  notice.textContent = t("sound.notice");

  const stage = document.createElement("div");
  stage.className = "sound-stage";

  control.addEventListener("click", () => {
    if (stage.firstChild === null) {
      stage.append(frame(video));
      control.textContent = `■ ${t("sound.stop")}`;
      notice.hidden = true;
    } else {
      stage.replaceChildren();
      control.textContent = `▶ ${t("sound.play")}`;
      notice.hidden = false;
    }
  });

  window.addEventListener("langchange", () => {
    label.textContent = `${t("sound.label")}: ${text(slot.dataset.soundLabel, video)}`;
    const playing = stage.firstChild !== null;
    control.textContent = playing ? `■ ${t("sound.stop")}` : `▶ ${t("sound.play")}`;
  });

  line.append(control, label, notice);
  wrap.append(line, stage);
  return wrap;
}

function frame(video) {
  const player = document.createElement("iframe");
  player.src = `${EMBED}${encodeURIComponent(video)}?autoplay=1&rel=0&modestbranding=1`;
  player.title = t("sound.frame");
  player.allow = "autoplay";
  player.referrerPolicy = "strict-origin-when-cross-origin";
  player.loading = "lazy";
  player.width = 320;
  player.height = 180;
  return player;
}

/* Any of the shapes a YouTube address comes in, and nothing else. */
export function videoId(value) {
  if (value === "") {
    return "";
  }
  let url = null;
  try {
    url = new URL(value);
  } catch {
    return /^[\w-]{11}$/.test(value) ? value : "";
  }
  const host = url.hostname.replace(/^www\./, "");
  let candidate = "";
  if (host === "youtu.be") {
    candidate = url.pathname.slice(1);
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const path = url.pathname;
    if (path === "/watch") {
      candidate = url.searchParams.get("v") ?? "";
    } else if (path.startsWith("/embed/") || path.startsWith("/shorts/") || path.startsWith("/live/")) {
      candidate = path.split("/")[2] ?? "";
    }
  }
  return /^[\w-]{11}$/.test(candidate) ? candidate : "";
}
