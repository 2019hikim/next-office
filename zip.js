// 아주 작은 ZIP 도구. HWPX는 ZIP 묶음이라 쓰기와 읽기를 직접 한다.
// 쓰기: 무압축(stored) 또는 미리 deflate-raw로 압축한 데이터. 읽기: 무압축과 deflate.
// 브라우저(index.html)와 node(tests/run-tests.js) 양쪽에서 같이 쓴다.

const CRC32_TABLE = createCrc32Table();

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function computeCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUtf8(text) {
  return new TextEncoder().encode(text);
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function convertToDosDateTime(date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

// entries: [{ name, data: Uint8Array | 문자열, deflated?: data를 deflate-raw로 압축한 Uint8Array }]
// options.date: 파일 시각 (같은 시각이면 같은 바이트가 나온다)
function writeZip(entries, options) {
  const dos = convertToDosDateTime((options && options.date) || new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;

  entries.forEach((entry) => {
    const data = typeof entry.data === "string" ? encodeUtf8(entry.data) : entry.data;
    const stored = entry.deflated || data;
    const method = entry.deflated ? 8 : 0;
    const name = encodeUtf8(entry.name);
    const flags = /^[\x00-\x7f]*$/.test(entry.name) ? 0 : 0x0800;
    const crc = computeCrc32(data);

    const local = new Uint8Array(30 + name.length + stored.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, dos.time, true);
    lv.setUint16(12, dos.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(stored, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, dos.time, true);
    cv.setUint16(14, dos.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  });

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = locals.concat(centrals, [end]);
  const result = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  parts.forEach((part) => {
    result.set(part, position);
    position += part.length;
  });
  return result;
}

// 반환: { "경로/이름": Uint8Array } — 폴더 항목은 넣지 않는다.
async function readZip(input) {
  const bytes = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let endOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0) {
    throw new Error("ZIP 묶음 파일이 아닙니다");
  }

  const count = view.getUint16(endOffset + 10, true);
  let p = view.getUint32(endOffset + 16, true);
  const files = {};

  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) {
      throw new Error("ZIP 목차가 깨졌습니다");
    }
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decodeUtf8(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) {
      continue;
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method === 0) {
      files[name] = raw.slice();
    } else if (method === 8) {
      files[name] = await inflateRaw(raw);
    } else {
      throw new Error("지원하지 않는 압축 방식입니다 (" + method + "): " + name);
    }
  }
  return files;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("이 브라우저는 압축된 파일을 풀 수 없습니다. 최신 Chrome이나 Edge에서 열어 주세요.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
