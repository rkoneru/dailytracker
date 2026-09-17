// A ZIP writer, in about a hundred lines.
//
// A .pptx is a ZIP of XML, so exporting a deck means writing a ZIP, and the
// app has no runtime dependencies. JSZip is ~100 KB — a third again on top of
// the entire application — to do something the format makes genuinely small
// if you give up compression.
//
// So these archives are stored, not deflated. The cost is file size; a deck of
// text XML that would compress to ~20 KB ships at ~80 KB. That is a rounding
// error next to the download it replaces, and it buys back the whole library.
// Every tool that opens a .pptx reads stored entries — the format has required
// it since 1989.

/** CRC-32, the one thing a stored ZIP still has to compute. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function bytesOf(content) {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content;
}

/**
 * MS-DOS date and time, which is what the ZIP header wants.
 *
 * Two seconds of resolution and no year before 1980, because the format was
 * designed when that was plenty.
 */
function dosStamp(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class Writer {
  constructor(size) {
    this.view = new DataView(new ArrayBuffer(size));
    this.bytes = new Uint8Array(this.view.buffer);
    this.at = 0;
  }

  u16(value) { this.view.setUint16(this.at, value, true); this.at += 2; }
  u32(value) { this.view.setUint32(this.at, value >>> 0, true); this.at += 4; }
  raw(bytes) { this.bytes.set(bytes, this.at); this.at += bytes.length; }
}

/**
 * Builds a ZIP from `{ path: content }`, where content is a string or bytes.
 *
 * Entry order is preserved: a .pptx wants `[Content_Types].xml` first, and
 * while most readers cope either way, the ones that do not fail in ways that
 * are very hard to debug from the other end of a download.
 */
export function zip(files, { date = new Date() } = {}) {
  const stamp = dosStamp(date);
  const entries = Object.entries(files).map(([path, content]) => {
    const name = new TextEncoder().encode(path);
    const data = bytesOf(content);
    return { name, data, crc: crc32(data) };
  });

  const LOCAL = 30;
  const CENTRAL = 46;
  const END = 22;
  const total = entries.reduce(
    (sum, e) => sum + LOCAL + e.name.length + e.data.length + CENTRAL + e.name.length, END);

  const out = new Writer(total);
  const offsets = [];

  entries.forEach((entry) => {
    offsets.push(out.at);
    out.u32(0x04034B50);      // local file header
    out.u16(20);              // version needed
    out.u16(0);               // flags
    out.u16(0);               // method 0 = stored
    out.u16(stamp.time);
    out.u16(stamp.date);
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.name.length);
    out.u16(0);               // extra field length
    out.raw(entry.name);
    out.raw(entry.data);
  });

  const centralAt = out.at;
  entries.forEach((entry, i) => {
    out.u32(0x02014B50);      // central directory header
    out.u16(20);              // version made by
    out.u16(20);              // version needed
    out.u16(0);
    out.u16(0);
    out.u16(stamp.time);
    out.u16(stamp.date);
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.name.length);
    out.u16(0);               // extra
    out.u16(0);               // comment
    out.u16(0);               // disk number
    out.u16(0);               // internal attributes
    out.u32(0);               // external attributes
    out.u32(offsets[i]);
    out.raw(entry.name);
  });

  // Measured before the end record starts, not while writing it: `out.at` has
  // already moved on by then, and a central directory reported 12 bytes too
  // long makes every reader seek 12 bytes short of the first header and
  // declare the archive corrupt.
  const centralSize = out.at - centralAt;

  out.u32(0x06054B50);        // end of central directory
  out.u16(0);                 // this disk
  out.u16(0);                 // disk the central directory starts on
  out.u16(entries.length);    // entries on this disk
  out.u16(entries.length);    // entries in total
  out.u32(centralSize);
  out.u32(centralAt);
  out.u16(0);                 // comment length

  return out.bytes;
}
