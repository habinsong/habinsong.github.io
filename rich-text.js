const TEXT_SIZES = new Set(["small", "normal", "large"]);

export function appendRichText(node, value, runs) {
  const text = typeof value === "string" ? value : "";
  const safeRuns = normalizedRuns(runs);
  if (safeRuns.length === 0 || safeRuns.map((run) => run.text).join("") !== text) {
    node.textContent = text;
    return;
  }

  node.classList.add("rich-text");
  for (const run of safeRuns) {
    let content = document.createTextNode(run.text);
    if (run.underline === true) content = wrapped("u", content);
    if (run.italic === true) content = wrapped("em", content);
    if (run.bold === true) content = wrapped("strong", content);
    if (TEXT_SIZES.has(run.size)) {
      const size = document.createElement("span");
      size.dataset.textSize = run.size;
      size.className = `text-size-${run.size}`;
      size.append(content);
      content = size;
    }
    node.append(content);
  }
}

export function copyRichTextRuns(value) {
  return normalizedRuns(value).map((run) => ({ ...run }));
}

function normalizedRuns(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null || typeof raw.text !== "string" || raw.text.length === 0) {
      return [];
    }
    const run = { text: raw.text };
    if (raw.bold === true) run.bold = true;
    if (raw.italic === true) run.italic = true;
    if (raw.underline === true) run.underline = true;
    if (TEXT_SIZES.has(raw.size)) run.size = raw.size;
    return [run];
  });
}

function wrapped(tag, content) {
  const node = document.createElement(tag);
  node.append(content);
  return node;
}
