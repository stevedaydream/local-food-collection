/**
 * Google 地圖連結解析與地址工具（純函式、不連網），給 `/api/resolve-place` 與前端共用。
 *
 * 兩個方向的自動填入都靠這裡把使用者貼進來的東西拆成可查詢的線索：
 * - 貼 Google 連結 → 從網址撈出店名 / 座標 / place_id
 * - 貼地址 → 從地址推縣市（存進 city 欄位，篩選與 widget 選區域都會用到）
 */

/** 純座標字串，例：25.033,121.5654 */
const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Google 地圖網址（含 App 分享出來的短網址） */
const MAPS_HOST = /(^|\/\/)(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i;

/** Google 短網址：需要先展開才拿得到店名與座標 */
const SHORT_HOST = /\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)\//i;

/** 從一段文字裡撈出第一個網址（分享進來的文字常常前後夾著店名與宣傳語） */
export function findUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/);
  return m ? m[0].replace(/[.,;)]+$/, '') : null;
}

export function isMapsUrl(url: string): boolean {
  return MAPS_HOST.test(url);
}

export function isShortUrl(url: string): boolean {
  return SHORT_HOST.test(url);
}

export interface MapsUrlHint {
  /** 網址裡的店名（/maps/place/<店名>/ 或 ?q=）；可能其實是地址 */
  name: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function validCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** 解析（已展開的）Google 地圖網址，拿到店名 / 座標 / place_id */
export function parseMapsUrl(url: string): MapsUrlHint {
  const hint: MapsUrlHint = { name: null, lat: null, lng: null, placeId: null };
  let sp: URLSearchParams;
  let pathname = '';
  try {
    const u = new URL(url);
    sp = u.searchParams;
    pathname = safeDecode(u.pathname);
  } catch {
    return hint;
  }

  // /maps/place/<店名>/@...、/maps/search/<關鍵字>/、/maps/dir//<目的地>/ — 空白會被編成 +
  const inPath = pathname.match(/\/maps\/(?:place|search|dir)\/+([^/@]+)/);
  if (inPath) {
    const text = inPath[1].replace(/\+/g, ' ').trim();
    if (text && !COORDS.test(text) && !text.startsWith('place_id:')) hint.name = text;
  }

  const q = (sp.get('q') || sp.get('query') || sp.get('destination') || '').trim();
  const qCoords = q.match(COORDS);

  // 座標：!3d!4d 是「店家實際位置」，@ 只是地圖視角中心，優先用前者
  const data = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const coords = data ?? qCoords ?? at;
  if (coords) {
    const lat = parseFloat(coords[1]);
    const lng = parseFloat(coords[2]);
    if (validCoords(lat, lng)) {
      hint.lat = lat;
      hint.lng = lng;
    }
  }

  hint.placeId =
    sp.get('query_place_id') || sp.get('place_id') || q.match(/place_id:([\w-]+)/)?.[1] || null;

  // 網址沒有 /place/ 路徑時（?api=1&query=店名 地址）用 q 當店名線索
  if (!hint.name && q && !qCoords && !q.startsWith('place_id:')) hint.name = q;

  return hint;
}

const TW_CITIES = [
  '基隆市', '臺北市', '新北市', '桃園市', '新竹縣', '新竹市', '苗栗縣', '臺中市',
  '彰化縣', '南投縣', '雲林縣', '嘉義縣', '嘉義市', '臺南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
];

/**
 * 從地址推縣市，統一用「台」而非「臺」（跟使用者手動輸入的習慣一致，
 * 篩選與 widget 選區域才不會出現台北市／臺北市兩個項目）。
 */
export function guessCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const normalized = address.replace(/臺/g, '台');
  for (const city of TW_CITIES) {
    const name = city.replace(/臺/g, '台');
    if (normalized.includes(name)) return name;
  }
  return null;
}

/**
 * 行政區名稱正規化，統一寫入資料前呼叫，避免同一個地區在篩選選單裡裂成兩項：
 * - Nominatim 有時回「冲绳县 / 沖繩縣」這種簡繁併排 → 取後面的繁體
 * - 臺 → 台（與使用者手動輸入的習慣一致）
 * - 日文行政區後綴轉繁體：区 → 區、県 → 縣（地名主體保留原文，例如「渋谷」不動）
 */
export function normalizeRegion(name: string | null | undefined): string | null {
  if (!name) return null;
  const picked = name.includes(' / ') ? name.split(' / ').pop()! : name;
  const out = picked
    .trim()
    .replace(/臺/g, '台')
    .replace(/区/g, '區')
    .replace(/県/g, '縣');
  return out || null;
}

/** 產生 Google 地圖連結；有 place_id 就鎖定那家店（會開店家頁而不是只掉一根座標針） */
export function buildGoogleUrl(p: {
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
}): string {
  const query =
    [p.name, p.address].filter(Boolean).join(' ').trim() ||
    (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : '');
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return p.placeId ? `${base}&query_place_id=${encodeURIComponent(p.placeId)}` : base;
}
