import { t } from "../i18n.js";
import { positiveNumber } from "./admin-utils.js";

export function textInput(labelText, value, onChange, wide = false) {
  const label = labelled(labelText, wide);
  const input = document.createElement("input");
  input.value = value;
  input.addEventListener("input", () => onChange(input.value));
  label.append(input);
  return label;
}

export function selectInput(labelText, value, options, onChange) {
  const label = labelled(labelText, false);
  const select = document.createElement("select");
  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === value;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  label.append(select);
  return label;
}

export function assetFields(asset, onChange) {
  return [
    textInput(t("a.field.title"), asset.title, (value) => { asset.title = value; onChange(); }),
    selectInput(t("a.field.medium"), asset.medium, [
      { value: "digital", label: t("medium.digital") },
      { value: "film", label: t("medium.film") },
    ], (value) => { asset.medium = value; onChange(); }),
    selectInput(t("a.field.tone"), asset.tone, [
      { value: "color", label: t("tone.color") },
      { value: "bw", label: t("tone.bw") },
    ], (value) => { asset.tone = value; onChange(); }),
    textInput(t("a.field.place"), asset.place, (value) => { asset.place = value; onChange(); }),
    textInput(t("a.field.year"), asset.year, (value) => { asset.year = value; onChange(); }),
    textInput(t("a.field.ratio.width"), String(asset.width), (value) => { asset.width = positiveNumber(Number(value), 3); onChange(); }),
    textInput(t("a.field.ratio.height"), String(asset.height), (value) => { asset.height = positiveNumber(Number(value), 2); onChange(); }),
    textInput(t("a.field.details"), asset.details, (value) => { asset.details = value; onChange(); }, true),
    textInput(t("a.field.alt"), asset.alt, (value) => { asset.alt = value; onChange(); }, true),
  ];
}

function labelled(textValue, wide) {
  const label = document.createElement("label");
  if (wide) label.className = "wide";
  const span = document.createElement("span");
  span.textContent = textValue;
  label.append(span);
  return label;
}
