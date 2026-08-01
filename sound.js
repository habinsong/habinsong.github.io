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

/* The whole line is the control: a mark, then the name of the thing. No word
   for "play" and no word for "sound track" — the triangle says the first and
   the line it sits on says the second. */
function player(slot, video) {
  const wrap = document.createElement("div");
  wrap.className = "sound";

  const control = document.createElement("button");
  control.type = "button";
  control.className = "sound-toggle";

  const glyph = mark();
  const title = document.createElement("span");
  title.className = "sound-title";
  title.textContent = text(slot.dataset.soundLabel, video);

  const stage = document.createElement("div");
  stage.className = "sound-stage";

  const playing = () => stage.firstChild !== null;
  const relabel = () => {
    control.setAttribute("aria-label", `${t(playing() ? "sound.stop" : "sound.play")}: ${title.textContent}`);
  };

  control.addEventListener("click", () => {
    if (playing()) {
      stage.replaceChildren();
    } else {
      stage.append(frame(video));
    }
    wrap.classList.toggle("is-playing", playing());
    glyph.replaceChildren(shape(playing()));
    relabel();
  });

  window.addEventListener("langchange", relabel);

  control.append(glyph, title);
  wrap.append(control, stage);
  relabel();
  return wrap;
}

function mark() {
  const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  glyph.setAttribute("class", "sound-glyph");
  glyph.setAttribute("viewBox", "0 0 10 10");
  /* an svg with no size of its own fills whatever it is given, so it is given
     one here as well as in the stylesheet */
  glyph.setAttribute("width", "8");
  glyph.setAttribute("height", "8");
  glyph.setAttribute("aria-hidden", "true");
  glyph.append(shape(false));
  return glyph;
}

function shape(stopping) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", stopping ? "rect" : "path");
  if (stopping) {
    node.setAttribute("x", "1");
    node.setAttribute("y", "1");
    node.setAttribute("width", "8");
    node.setAttribute("height", "8");
  } else {
    node.setAttribute("d", "M1 0.5 L9.5 5 L1 9.5 Z");
  }
  return node;
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
