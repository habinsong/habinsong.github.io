// Reads pixel dimensions for any image and EXIF capture data from JPEGs.
// The parser walks JPEG segments to the Exif APP1 block, then reads the
// TIFF IFDs directly — only the handful of tags the composer can use.

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;
const TAG_EXPOSURE = 0x829a;
const TAG_FNUMBER = 0x829d;
const TAG_ISO = 0x8827;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_FOCAL = 0x920a;
const TAG_LENS_MODEL = 0xa434;

export async function readImageInfo(file) {
  const info = { width: 0, height: 0, exif: {} };
  try {
    const bitmap = await createImageBitmap(file);
    info.width = bitmap.width;
    info.height = bitmap.height;
    bitmap.close();
  } catch {
    // Dimensions stay 0; the caller keeps its defaults.
  }
  if (file.type === "image/jpeg") {
    try {
      const view = new DataView(await file.slice(0, 262144).arrayBuffer());
      info.exif = parseJpegExif(view);
    } catch {
      info.exif = {};
    }
  }
  return info;
}

function parseJpegExif(view) {
  if (view.getUint16(0) !== 0xffd8) {
    return {};
  }
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) {
      break;
    }
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      return parseTiff(view, offset + 10);
    }
    offset += 2 + size;
  }
  return {};
}

function parseTiff(view, base) {
  const little = view.getUint16(base) === 0x4949;
  const get16 = (at) => view.getUint16(at, little);
  const get32 = (at) => view.getUint32(at, little);
  if (get16(base + 2) !== 42) {
    return {};
  }
  const exif = {};
  const readers = { get16, get32, base, view };
  let exifIfdOffset = 0;
  forEachEntry(readers, base + get32(base + 4), (tag, entry) => {
    if (tag === TAG_MAKE) exif.make = readAscii(readers, entry);
    if (tag === TAG_MODEL) exif.model = readAscii(readers, entry);
    if (tag === TAG_EXIF_IFD) exifIfdOffset = get32(entry + 8);
  });
  if (exifIfdOffset > 0) {
    forEachEntry(readers, base + exifIfdOffset, (tag, entry) => {
      if (tag === TAG_DATETIME_ORIGINAL) exif.dateTimeOriginal = readAscii(readers, entry);
      if (tag === TAG_EXPOSURE) exif.exposure = readRational(readers, entry);
      if (tag === TAG_FNUMBER) exif.fnumber = readRational(readers, entry);
      if (tag === TAG_ISO) exif.iso = get16(entry + 8);
      if (tag === TAG_FOCAL) exif.focal = readRational(readers, entry);
      if (tag === TAG_LENS_MODEL) exif.lens = readAscii(readers, entry);
    });
  }
  return exif;
}

function forEachEntry(readers, ifdOffset, visit) {
  const { get16, view } = readers;
  if (ifdOffset + 2 > view.byteLength) {
    return;
  }
  const count = get16(ifdOffset);
  for (let index = 0; index < count; index += 1) {
    const entry = ifdOffset + 2 + index * 12;
    if (entry + 12 > view.byteLength) {
      return;
    }
    visit(get16(entry), entry);
  }
}

function readAscii(readers, entry) {
  const { get32, base, view } = readers;
  const length = get32(entry + 4);
  const start = length > 4 ? base + get32(entry + 8) : entry + 8;
  if (start + length > view.byteLength) {
    return undefined;
  }
  let value = "";
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(start + index);
    if (code === 0) {
      break;
    }
    value += String.fromCharCode(code);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRational(readers, entry) {
  const { get32, base, view } = readers;
  const at = base + get32(entry + 8);
  if (at + 8 > view.byteLength) {
    return undefined;
  }
  const num = get32(at);
  const den = get32(at + 4);
  return den === 0 ? undefined : { num, den };
}
