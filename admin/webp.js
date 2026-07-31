// Photographs are re-encoded as WebP before they go into the bundle, so a roll
// of JPEGs stops weighing tens of megabytes in the repository.
//
// A canvas keeps the pixels and drops everything else, so the Exif block is
// read out of the original file and written back into the WebP container
// afterwards. Without that the camera, lens and exposure would be gone from
// the file itself, even though the composer has already copied them into the
// post.

// The long edge a photograph is allowed to keep. 3200 covers a full-screen
// view on a retina display with room to spare; anything larger is weight the
// page never uses.
const MAX_EDGE = 3200;
const QUALITY = 0.82;

const EXIF_FLAG = 0x08;

export async function toWebp(file) {
  if (file.type === "image/webp") {
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  let encoded;
  try {
    encoded = await encode(bitmap, width, height);
  } catch {
    return file;
  } finally {
    bitmap.close();
  }

  if (encoded === null) {
    return file;
  }

  // Re-encoding a small, already efficient picture can make it bigger. Keeping
  // the original is the whole point of the exercise, so let it stand — unless
  // the picture was oversized, where the smaller one is what we came for.
  if (scale === 1 && encoded.byteLength >= file.size) {
    return file;
  }

  const exif = await jpegExif(file);
  const bytes = exif === null ? encoded : withExif(encoded, exif, width, height);
  const name = `${file.name.replace(/\.[^.]+$/, "")}.webp`;
  return new File([bytes], name, { type: "image/webp", lastModified: file.lastModified });
}

function encode(bitmap, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    return Promise.resolve(null);
  }
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null || blob.type !== "image/webp") {
          resolve(null);
          return;
        }
        blob.arrayBuffer().then(
          (buffer) => resolve(new Uint8Array(buffer)),
          () => resolve(null),
        );
      },
      "image/webp",
      QUALITY,
    );
  });
}

// The Exif payload of a JPEG: the APP1 segment past its "Exif\0\0" header.
async function jpegExif(file) {
  if (file.type !== "image/jpeg") {
    return null;
  }
  try {
    const buffer = await file.slice(0, 1048576).arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) {
      return null;
    }
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) {
        return null;
      }
      const size = view.getUint16(offset + 2);
      const end = offset + 2 + size;
      if (end > view.byteLength) {
        return null;
      }
      if (marker === 0xffe1 && size > 8 && view.getUint32(offset + 4) === 0x45786966) {
        return new Uint8Array(buffer, offset + 10, size - 8);
      }
      offset = end;
    }
  } catch {
    return null;
  }
  return null;
}

// A plain WebP holds one image chunk and nothing else. Metadata needs the
// extended layout: a VP8X header that declares what follows, then the image,
// then the Exif chunk.
function withExif(webp, exif, width, height) {
  const chunks = readChunks(webp);
  if (chunks === null) {
    return webp;
  }

  const header = chunks.find((chunk) => chunk.tag === "VP8X");
  if (header === undefined) {
    const payload = new Uint8Array(10);
    payload[0] = EXIF_FLAG;
    writeUint24(payload, 4, width - 1);
    writeUint24(payload, 7, height - 1);
    chunks.unshift({ tag: "VP8X", payload });
  } else {
    header.payload[0] |= EXIF_FLAG;
  }

  chunks.push({ tag: "EXIF", payload: exif });
  return writeChunks(chunks);
}

function readChunks(webp) {
  const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength);
  if (webp.byteLength < 12 || tagAt(view, 0) !== "RIFF" || tagAt(view, 8) !== "WEBP") {
    return null;
  }
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= webp.byteLength) {
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > webp.byteLength) {
      return null;
    }
    chunks.push({ tag: tagAt(view, offset), payload: webp.slice(start, start + size) });
    offset = start + size + (size % 2);
  }
  return chunks;
}

function writeChunks(chunks) {
  let body = 4; // the "WEBP" that follows the RIFF size
  for (const chunk of chunks) {
    body += 8 + chunk.payload.byteLength + (chunk.payload.byteLength % 2);
  }
  const out = new Uint8Array(8 + body);
  const view = new DataView(out.buffer);
  writeTag(out, 0, "RIFF");
  view.setUint32(4, body, true);
  writeTag(out, 8, "WEBP");

  let offset = 12;
  for (const chunk of chunks) {
    writeTag(out, offset, chunk.tag);
    view.setUint32(offset + 4, chunk.payload.byteLength, true);
    out.set(chunk.payload, offset + 8);
    offset += 8 + chunk.payload.byteLength + (chunk.payload.byteLength % 2);
  }
  return out;
}

function tagAt(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function writeTag(out, offset, tag) {
  for (let index = 0; index < 4; index += 1) {
    out[offset + index] = tag.charCodeAt(index);
  }
}

function writeUint24(out, offset, value) {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >> 8) & 0xff;
  out[offset + 2] = (value >> 16) & 0xff;
}
