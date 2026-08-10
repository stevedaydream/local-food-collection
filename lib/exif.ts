/**
 * 從 JPEG 的 EXIF 讀出拍照座標（不依賴任何套件）。
 *
 * 為什麼需要：`lib/image.ts` 用 canvas 壓縮圖片，過程會把 EXIF 整個丟掉，
 * 所以要在壓縮前直接從原始檔案讀。相簿裡的舊照片靠它才知道是在哪裡拍的。
 *
 * 只解析到需要的部分：JPEG segment → APP1(Exif) → TIFF header → IFD0 → GPS IFD。
 * 讀不到（PNG、截圖、相機沒開位置標記）就回 null，呼叫端退回目前定位。
 */

const TAG_GPS_IFD = 0x8825;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

/** EXIF 型別 5 = RATIONAL（兩個 uint32：分子、分母） */
const TYPE_RATIONAL = 5;
const TYPE_ASCII = 2;

interface Entry {
  type: number;
  count: number;
  valueOffset: number;
}

/** 讀一個 IFD，回傳 tag → entry */
function readIfd(view: DataView, tiffStart: number, ifdOffset: number, le: boolean): Map<number, Entry> {
  const out = new Map<number, Entry>();
  const base = tiffStart + ifdOffset;
  if (base + 2 > view.byteLength) return out;
  const count = view.getUint16(base, le);
  for (let i = 0; i < count; i++) {
    const p = base + 2 + i * 12;
    if (p + 12 > view.byteLength) break;
    out.set(view.getUint16(p, le), {
      type: view.getUint16(p + 2, le),
      count: view.getUint32(p + 4, le),
      // 值 ≤4 bytes 直接放在這裡，否則這裡是相對 TIFF 開頭的位移
      valueOffset: p + 8,
    });
  }
  return out;
}

/** 讀 RATIONAL 陣列（度、分、秒） */
function readRationals(view: DataView, tiffStart: number, entry: Entry, le: boolean): number[] {
  const out: number[] = [];
  const offset = tiffStart + view.getUint32(entry.valueOffset, le);
  for (let i = 0; i < entry.count; i++) {
    const p = offset + i * 8;
    if (p + 8 > view.byteLength) break;
    const num = view.getUint32(p, le);
    const den = view.getUint32(p + 4, le);
    out.push(den === 0 ? 0 : num / den);
  }
  return out;
}

/** 讀 ASCII（N/S/E/W）——長度 ≤4 時值就在 valueOffset 上 */
function readAscii(view: DataView, tiffStart: number, entry: Entry, le: boolean): string {
  const offset = entry.count <= 4 ? entry.valueOffset : tiffStart + view.getUint32(entry.valueOffset, le);
  let s = '';
  for (let i = 0; i < entry.count; i++) {
    if (offset + i >= view.byteLength) break;
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim().toUpperCase();
}

function toDecimal(dms: number[], ref: string): number | null {
  if (!dms.length) return null;
  const [d = 0, m = 0, s = 0] = dms;
  let value = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') value = -value;
  return Number.isFinite(value) ? value : null;
}

/** 在 JPEG 裡找 APP1(Exif) segment，回傳 TIFF header 的起始位移 */
function findTiffStart(view: DataView): number | null {
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null; // 不是 JPEG
  let p = 2;
  while (p + 4 <= view.byteLength) {
    if (view.getUint8(p) !== 0xff) return null; // segment 結構壞了
    const marker = view.getUint8(p + 1);
    if (marker === 0xda) return null; // 進到影像資料，沒有 EXIF
    const size = view.getUint16(p + 2, false);
    if (marker === 0xe1 && p + 10 <= view.byteLength) {
      // "Exif\0\0"
      const isExif =
        view.getUint32(p + 4, false) === 0x45786966 && view.getUint16(p + 8, false) === 0x0000;
      if (isExif) return p + 10;
    }
    p += 2 + size;
  }
  return null;
}

/** 讀出照片的拍攝座標；沒有 EXIF GPS 就回 null */
export async function readExifGps(file: Blob): Promise<{ lat: number; lng: number } | null> {
  try {
    // GPS 一定在檔頭附近，只讀前 256KB 就夠（避免整張大圖進記憶體）
    const head = file.slice(0, 256 * 1024);
    const view = new DataView(await head.arrayBuffer());

    const tiffStart = findTiffStart(view);
    if (tiffStart == null || tiffStart + 8 > view.byteLength) return null;

    const byteOrder = view.getUint16(tiffStart, false);
    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
    const le = byteOrder === 0x4949; // "II" = little endian
    if (view.getUint16(tiffStart + 2, le) !== 0x002a) return null;

    const ifd0 = readIfd(view, tiffStart, view.getUint32(tiffStart + 4, le), le);
    const gpsPointer = ifd0.get(TAG_GPS_IFD);
    if (!gpsPointer) return null;

    const gps = readIfd(view, tiffStart, view.getUint32(gpsPointer.valueOffset, le), le);
    const latEntry = gps.get(TAG_GPS_LAT);
    const lngEntry = gps.get(TAG_GPS_LNG);
    const latRef = gps.get(TAG_GPS_LAT_REF);
    const lngRef = gps.get(TAG_GPS_LNG_REF);
    if (!latEntry || !lngEntry || latEntry.type !== TYPE_RATIONAL || lngEntry.type !== TYPE_RATIONAL) {
      return null;
    }

    const lat = toDecimal(
      readRationals(view, tiffStart, latEntry, le),
      latRef && latRef.type === TYPE_ASCII ? readAscii(view, tiffStart, latRef, le) : 'N',
    );
    const lng = toDecimal(
      readRationals(view, tiffStart, lngEntry, le),
      lngRef && lngRef.type === TYPE_ASCII ? readAscii(view, tiffStart, lngRef, le) : 'E',
    );
    if (lat == null || lng == null) return null;
    // 0,0 幾乎都是壞資料而不是幾內亞灣
    if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
