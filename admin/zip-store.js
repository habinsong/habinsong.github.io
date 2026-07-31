const ENCODER = new TextEncoder();
const CRC_TABLE = makeCrcTable();

export async function zipFiles(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = ENCODER.encode(entry.name);
    const data = await bytes(entry.input);
    const crc = crc32(data);
    const local = localHeader(nameBytes, data, crc);
    locals.push(local, data);
    centrals.push(centralHeader(nameBytes, data, crc, offset));
    offset += local.byteLength + data.byteLength;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.byteLength, 0);
  const end = endRecord(entries.length, centralSize, offset);
  return new Blob([...locals, ...centrals, end], { type: "application/zip" });
}

async function bytes(input) {
  if (typeof input === "string") {
    return ENCODER.encode(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new Error("Unsupported ZIP input");
}

function localHeader(nameBytes, data, crc) {
  const header = new Uint8Array(30 + nameBytes.byteLength);
  const view = new DataView(header.buffer);
  write32(view, 0, 0x04034b50);
  write16(view, 4, 20);
  write16(view, 6, 0x0800);
  write16(view, 8, 0);
  write16(view, 10, 0);
  write16(view, 12, 0);
  write32(view, 14, crc);
  write32(view, 18, data.byteLength);
  write32(view, 22, data.byteLength);
  write16(view, 26, nameBytes.byteLength);
  write16(view, 28, 0);
  header.set(nameBytes, 30);
  return header;
}

function centralHeader(nameBytes, data, crc, offset) {
  const header = new Uint8Array(46 + nameBytes.byteLength);
  const view = new DataView(header.buffer);
  write32(view, 0, 0x02014b50);
  write16(view, 4, 20);
  write16(view, 6, 20);
  write16(view, 8, 0x0800);
  write16(view, 10, 0);
  write16(view, 12, 0);
  write16(view, 14, 0);
  write32(view, 16, crc);
  write32(view, 20, data.byteLength);
  write32(view, 24, data.byteLength);
  write16(view, 28, nameBytes.byteLength);
  write16(view, 30, 0);
  write16(view, 32, 0);
  write16(view, 34, 0);
  write16(view, 36, 0);
  write32(view, 38, 0);
  write32(view, 42, offset);
  header.set(nameBytes, 46);
  return header;
}

function endRecord(count, centralSize, centralOffset) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  write32(view, 0, 0x06054b50);
  write16(view, 4, 0);
  write16(view, 6, 0);
  write16(view, 8, count);
  write16(view, 10, count);
  write32(view, 12, centralSize);
  write32(view, 16, centralOffset);
  write16(view, 20, 0);
  return header;
}

function write16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function write32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
