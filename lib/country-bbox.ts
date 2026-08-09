/**
 * 座標 → 國家的離線判定表（純函式、零 API、可離線用）。
 *
 * 用途是「這家店跟我在同一個國家嗎」，不需要邊境級精度：
 * 台灣與日本的範圍完全不重疊，判斷旅行情境綽綽有餘。
 * 查不到（落在表外，例如歐洲內陸）回 null，呼叫端當「未知國家」處理，
 * 由 ⚙️ 設定的「補齊地區資料」用反查補上正式值（見 /api/reverse-geocode）。
 *
 * 框有重疊時「面積小的先贏」（下方 BOXES 會依面積排序），
 * 所以香港/澳門會贏過中國、新加坡會贏過馬來西亞。
 */

interface Box {
  code: string;
  name: string;
  /** [南, 北, 西, 東] */
  b: [number, number, number, number];
}

const RAW: Box[] = [
  { code: 'MO', name: '澳門', b: [22.05, 22.25, 113.5, 113.65] },
  { code: 'SG', name: '新加坡', b: [1.13, 1.51, 103.6, 104.1] },
  { code: 'HK', name: '香港', b: [22.13, 22.58, 113.8, 114.45] },
  { code: 'BN', name: '汶萊', b: [4.0, 5.1, 114.0, 115.4] },
  { code: 'TW', name: '台灣', b: [21.7, 26.4, 118.1, 122.1] },
  { code: 'KR', name: '韓國', b: [33.0, 38.65, 124.5, 131.0] },
  { code: 'KH', name: '柬埔寨', b: [10.4, 14.7, 102.3, 107.6] },
  { code: 'LA', name: '寮國', b: [13.9, 22.5, 100.0, 107.7] },
  { code: 'NP', name: '尼泊爾', b: [26.3, 30.5, 80.0, 88.2] },
  { code: 'LK', name: '斯里蘭卡', b: [5.9, 9.9, 79.6, 81.9] },
  { code: 'VN', name: '越南', b: [8.2, 23.4, 102.1, 109.5] },
  { code: 'TH', name: '泰國', b: [5.5, 20.5, 97.3, 105.7] },
  { code: 'JP', name: '日本', b: [24.0, 45.6, 122.9, 146.0] },
  { code: 'PH', name: '菲律賓', b: [4.6, 21.2, 116.9, 126.6] },
  { code: 'MY', name: '馬來西亞', b: [0.8, 7.4, 99.6, 119.3] },
  { code: 'NZ', name: '紐西蘭', b: [-47.3, -34.0, 166.3, 178.6] },
  { code: 'ID', name: '印尼', b: [-11.0, 6.1, 95.0, 141.1] },
  { code: 'IN', name: '印度', b: [6.7, 35.5, 68.1, 97.4] },
  { code: 'MN', name: '蒙古', b: [41.5, 52.2, 87.7, 119.9] },
  { code: 'AU', name: '澳洲', b: [-43.7, -10.0, 112.9, 153.7] },
  { code: 'CN', name: '中國', b: [18.1, 53.6, 73.5, 135.1] },
  // 以下幾個是「不會跟上面搞混」的常見旅遊地；歐陸內部邊界不強求精確
  { code: 'GB', name: '英國', b: [49.9, 58.7, -8.2, 1.8] },
  { code: 'IE', name: '愛爾蘭', b: [51.4, 55.4, -10.5, -5.9] },
  { code: 'PT', name: '葡萄牙', b: [36.9, 42.2, -9.6, -6.2] },
  { code: 'ES', name: '西班牙', b: [36.0, 43.8, -7.5, 3.4] },
  { code: 'IT', name: '義大利', b: [36.6, 47.1, 6.6, 18.6] },
  { code: 'CH', name: '瑞士', b: [45.8, 47.8, 5.9, 10.5] },
  { code: 'AT', name: '奧地利', b: [46.4, 49.0, 9.5, 17.2] },
  { code: 'FR', name: '法國', b: [42.3, 51.1, -4.8, 8.2] },
  { code: 'DE', name: '德國', b: [47.3, 55.1, 5.9, 15.0] },
  { code: 'TR', name: '土耳其', b: [35.8, 42.1, 25.7, 44.8] },
  { code: 'AE', name: '阿聯', b: [22.6, 26.1, 51.5, 56.4] },
  { code: 'EG', name: '埃及', b: [22.0, 31.7, 24.7, 36.9] },
  { code: 'ZA', name: '南非', b: [-34.9, -22.1, 16.4, 32.9] },
  { code: 'MX', name: '墨西哥', b: [14.5, 32.7, -118.4, -86.7] },
  { code: 'US', name: '美國', b: [18.9, 71.4, -179.2, -66.9] },
  { code: 'CA', name: '加拿大', b: [41.7, 83.1, -141.0, -52.6] },
  { code: 'BR', name: '巴西', b: [-33.8, 5.3, -74.0, -34.8] },
  { code: 'AR', name: '阿根廷', b: [-55.1, -21.8, -73.6, -53.6] },
  { code: 'CL', name: '智利', b: [-56.0, -17.5, -75.7, -66.4] },
];

/** 面積小的優先比對：香港贏中國、新加坡贏馬來西亞 */
const BOXES = [...RAW].sort((x, y) => area(x.b) - area(y.b));

function area([s, n, w, e]: [number, number, number, number]) {
  return (n - s) * (e - w);
}

export interface CountryHit {
  code: string;
  name: string;
}

/** 座標落在哪個國家；判不出來回 null（呼叫端視為未知，不要硬猜） */
export function countryOf(lat: number | null, lng: number | null): CountryHit | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const { code, name, b } of BOXES) {
    if (lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3]) return { code, name };
  }
  return null;
}

/** 兩點直線距離（公里），只用於排序與顯示 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = (a.lat - b.lat) * 111.32;
  const dLng = (a.lng - b.lng) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** 距離的人話版：1 公里內用公尺 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round(km * 1000 / 10) * 10)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}
