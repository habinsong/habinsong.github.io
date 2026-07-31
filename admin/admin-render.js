import { t } from "../i18n.js";
import { assetFields } from "./admin-fields.js";

export function renderAssets(assetList, state, onChange) {
  if (state.assets.length === 0) {
    assetList.replaceChildren(emptyNote(t("a.assets.empty")));
    return;
  }
  assetList.replaceChildren(...state.assets.map((asset) => assetEditor(asset, onChange)));
}

function assetEditor(asset, onChange) {
  const item = document.createElement("section");
  item.className = "asset-item";
  const header = document.createElement("header");
  const title = document.createElement("p");
  title.className = "asset-title";
  title.textContent = asset.file.name;
  const actions = document.createElement("span");
  actions.className = "asset-actions";
  const insert = document.createElement("button");
  insert.type = "button";
  insert.dataset.insertAsset = asset.id;
  insert.textContent = t("a.insert.asset");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.deleteAsset = asset.id;
  remove.textContent = t("a.remove");
  actions.append(insert, remove);
  header.append(title, actions);
  const fields = document.createElement("div");
  fields.className = "asset-fields";
  fields.append(...assetFields(asset, () => onChange(asset)));
  item.append(header, fields);
  return item;
}

function emptyNote(textValue) {
  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent = textValue;
  return note;
}
