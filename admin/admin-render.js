import { t } from "../i18n.js";
import { assetFields } from "./admin-fields.js?v=20260802-workspace-v10";

export function renderAssets(assetList, state, onChange) {
  if (state.assets.length === 0) {
    assetList.replaceChildren();
    return;
  }
  assetList.replaceChildren(...state.assets.map((asset, index) => assetEditor(asset, state, onChange, index)));
}

export function updateAssetStatuses(assetList, state) {
  for (const item of assetList.querySelectorAll(".asset-item")) {
    const asset = state.assets.find((candidate) => candidate.id === item.dataset.assetId);
    if (asset !== undefined) {
      updateAssetStatus(item, asset, state.blocks);
    }
  }
}

export function assetStatusSummary(state) {
  return {
    ready: state.assets.filter((asset) => (asset.alt ?? "").trim().length > 0).length,
    used: state.assets.filter((asset) => totalUses(assetUsage(state.blocks, asset.id)) > 0).length,
  };
}

function assetEditor(asset, state, onChange, index) {
  const item = document.createElement("section");
  item.className = "asset-item";
  item.dataset.assetId = asset.id;
  const header = document.createElement("header");
  const title = document.createElement("p");
  title.className = "asset-title";
  title.textContent = asset.file.name;
  title.title = asset.file.name;
  const thumb = document.createElement("img");
  thumb.className = "asset-thumb";
  thumb.src = asset.url;
  thumb.alt = "";
  const order = document.createElement("span");
  order.className = "asset-order";
  order.textContent = String(index + 1).padStart(2, "0");
  const statuses = document.createElement("span");
  statuses.className = "asset-statuses";
  statuses.append(
    statusBadge("asset-status", t("a.asset.ready")),
    statusBadge("asset-status asset-use-status", ""),
    statusBadge("asset-status asset-card-alt-status", ""),
  );
  const headingCopy = document.createElement("div");
  headingCopy.className = "asset-heading-copy";
  headingCopy.append(order, title, statuses);
  const heading = document.createElement("div");
  heading.className = "asset-heading";
  heading.append(thumb, headingCopy);
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
  header.append(heading, actions);
  const allFields = assetFields(asset, () => onChange(asset));
  const details = document.createElement("details");
  details.className = "asset-details";
  details.open = state.assets.length === 1;
  const detailsSummary = document.createElement("summary");
  detailsSummary.className = "asset-details-summary";
  const detailsLabel = document.createElement("span");
  detailsLabel.textContent = t("a.asset.edit");
  detailsSummary.append(detailsLabel);
  const altStatus = document.createElement("span");
  altStatus.className = "asset-alt-status";
  detailsSummary.append(altStatus);
  const fields = document.createElement("div");
  fields.className = "asset-fields";
  fields.append(...allFields.slice(0, 10));
  const altInput = fields.querySelector('[data-field="alt"] input');
  altInput?.addEventListener("input", () => {
    updateAssetStatus(item, asset, state.blocks);
  });
  const advanced = document.createElement("details");
  advanced.className = "asset-advanced";
  const summary = document.createElement("summary");
  summary.textContent = t("a.asset.advanced");
  const advancedFields = document.createElement("div");
  advancedFields.className = "asset-fields";
  advancedFields.append(...allFields.slice(10));
  advanced.append(summary, advancedFields);
  details.append(detailsSummary, fields, advanced);
  item.append(header, details);
  updateAssetStatus(item, asset, state.blocks);
  return item;
}

function statusBadge(className, textValue) {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = textValue;
  return badge;
}

function updateAssetStatus(item, asset, blocks) {
  const usage = assetUsage(blocks, asset.id);
  const useStatus = item.querySelector(".asset-use-status");
  if (useStatus !== null) {
    useStatus.textContent = usageText(usage);
    useStatus.classList.toggle("is-needed", totalUses(usage) === 0);
  }
  const altReady = (asset.alt ?? "").trim().length > 0;
  const cardAlt = item.querySelector(".asset-card-alt-status");
  if (cardAlt !== null) {
    cardAlt.textContent = t(altReady ? "a.asset.alt.ready" : "a.asset.alt.missing");
    cardAlt.classList.toggle("is-needed", !altReady);
  }
  const detailsAlt = item.querySelector(".asset-alt-status");
  if (detailsAlt !== null) {
    detailsAlt.textContent = t(altReady ? "a.asset.alt.ready" : "a.asset.alt.missing");
    detailsAlt.classList.toggle("is-needed", !altReady);
  }
}

function usageText(usage) {
  const labels = [];
  if (usage.body > 0) labels.push(t("a.asset.body.used", { n: usage.body }));
  if (usage.gallery > 0) labels.push(t("a.asset.gallery.used", { n: usage.gallery }));
  return labels.length > 0 ? labels.join(" · ") : t("a.asset.unused");
}

function totalUses(usage) {
  return usage.body + usage.gallery;
}

function assetUsage(blocks, assetId) {
  const usage = { body: 0, gallery: 0 };
  for (const block of blocks) {
    if (block.type === "photo" && (block.assetId === assetId || block.photo?.assetId === assetId)) {
      usage.body += 1;
    }
    if (block.type === "gallery") {
      const ids = Array.isArray(block.assetIds)
        ? block.assetIds
        : Array.isArray(block.photos) ? block.photos.map((photo) => photo?.assetId) : [];
      usage.gallery += ids.filter((id) => id === assetId).length;
    }
  }
  return usage;
}
