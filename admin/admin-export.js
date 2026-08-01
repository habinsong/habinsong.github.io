import { t } from "../i18n.js";
import { allPhotos, postSummary, stripAssetIds, validatePost } from "./admin-model.js?v=20260802-model-v2";
import { downloadBlob, extensionOf, pretty } from "./admin-utils.js";
import { zipFiles } from "./zip-store.js";

export function downloadJsonFile(post, validation) {
  const errors = validatePost(post);
  if (errors.length > 0) {
    validation.textContent = errors.join("\n");
    return;
  }
  downloadBlob(`${post.id}.json`, new Blob([pretty(stripAssetIds(post))], { type: "application/json" }));
  validation.textContent = t("a.msg.downloaded", { file: `${post.id}.json` });
}

export async function downloadZipFile(post, state, validation) {
  const errors = validatePost(post);
  if (errors.length > 0) {
    validation.textContent = errors.join("\n");
    return;
  }
  const entries = contentEntries(post);
  for (const asset of state.assets) {
    entries.push({ name: `photos/${post.id}/${asset.id}.${extensionOf(asset.file.name)}`, input: asset.file });
  }
  const zip = await zipFiles(entries);
  downloadBlob(`${post.id}-content-bundle.zip`, zip);
  validation.textContent = t("a.msg.downloaded", { file: `${post.id}-content-bundle.zip` });
}

function contentEntries(post) {
  const photos = allPhotos(post).map(({ assetId, ...photo }) => ({ ...photo, postId: post.id }));
  const entries = [
    { name: `content/posts/${post.id}.json`, input: pretty(stripAssetIds(post)) },
    { name: "content/posts/index.merge.json", input: pretty({ version: 1, posts: [postSummary(post)] }) },
    { name: "photos.merge.json", input: pretty({ version: 1, photos }) },
    { name: "README-publish.txt", input: publishReadme(post.id) },
  ];
  if (post.series.length > 0) {
    entries.push({ name: "series.merge.json", input: pretty({ version: 1, series: [{ id: post.series, title: post.seriesTitle }] }) });
  }
  return entries;
}

function publishReadme(postId) {
  return t("a.readme", { postId });
}
