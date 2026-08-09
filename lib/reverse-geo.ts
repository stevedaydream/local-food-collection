/**
 * 伺服器端：座標 → 國家 / 一級行政區 / 二級行政區（Nominatim reverse 代理的共用邏輯）。
 * 供 /api/reverse-geocode（顯示所在地、補齊地區資料）與 /api/resolve-place（存檔時帶入）共用。
 *
 * Nominatim 的欄位在各國並不統一，實測結果：
 * - 台北 101：city=臺北市、suburb=信義區                → 台北市 / 信義區
 * - 大阪梅田：province=大阪府、city=大阪市、suburb=北區  → 大阪市 / 北區
 * - 東京荒川：city=荒川區、quarter=荒川，**沒有 province**，只有 ISO3166-2-lvl4=JP-13
 *   → 靠 ISO 碼補上「東京都」，原本的 city（荒川區）降為二級 → 東京都 / 荒川區
 */
import { normalizeRegion } from './place-url';

/** 日本 47 都道府県（ISO 3166-2:JP）。東京 23 區的反查結果沒有 province，只能靠這張表補一級 */
const JP_PREFECTURES: Record<string, string> = {
  '01': '北海道', '02': '青森縣', '03': '岩手縣', '04': '宮城縣', '05': '秋田縣',
  '06': '山形縣', '07': '福島縣', '08': '茨城縣', '09': '栃木縣', '10': '群馬縣',
  '11': '埼玉縣', '12': '千葉縣', '13': '東京都', '14': '神奈川縣', '15': '新潟縣',
  '16': '富山縣', '17': '石川縣', '18': '福井縣', '19': '山梨縣', '20': '長野縣',
  '21': '岐阜縣', '22': '靜岡縣', '23': '愛知縣', '24': '三重縣', '25': '滋賀縣',
  '26': '京都府', '27': '大阪府', '28': '兵庫縣', '29': '奈良縣', '30': '和歌山縣',
  '31': '鳥取縣', '32': '島根縣', '33': '岡山縣', '34': '廣島縣', '35': '山口縣',
  '36': '德島縣', '37': '香川縣', '38': '愛媛縣', '39': '高知縣', '40': '福岡縣',
  '41': '佐賀縣', '42': '長崎縣', '43': '熊本縣', '44': '大分縣', '45': '宮崎縣',
  '46': '鹿兒島縣', '47': '沖繩縣',
};

export interface ReverseGeoResult {
  country: string | null;
  countryCode: string | null;
  /** 一級行政區：台北市 / 東京都 / 大阪市 */
  city: string | null;
  /** 二級行政區：信義區 / 荒川區 / 北區 */
  district: string | null;
}

const EMPTY: ReverseGeoResult = { country: null, countryCode: null, city: null, district: null };

interface NominatimAddress {
  country?: string;
  country_code?: string;
  state?: string;
  province?: string;
  county?: string;
  city?: string;
  town?: string;
  city_district?: string;
  borough?: string;
  suburb?: string;
  quarter?: string;
  'ISO3166-2-lvl4'?: string;
}

/** 由 ISO3166-2-lvl4 取一級行政區名（目前只需要日本，其他國家靠 state/province 欄位） */
function isoRegionName(iso: string | undefined): string | null {
  if (!iso) return null;
  const [country, code] = iso.split('-');
  if (country === 'JP') return JP_PREFECTURES[code] ?? null;
  return null;
}

export function fromNominatimAddress(a: NominatimAddress): ReverseGeoResult {
  let city = normalizeRegion(a.city ?? a.town ?? a.county ?? a.state ?? a.province);
  let district = normalizeRegion(a.city_district ?? a.suburb ?? a.borough ?? a.quarter ?? null);
  const iso = normalizeRegion(isoRegionName(a['ISO3166-2-lvl4']));

  // 東京 23 區這種「市級單位其實是區」的情況：沒有 state/province，就把 ISO 的一級補上來
  if (!a.state && !a.province && iso && city && iso !== city) {
    district = city;
    city = iso;
  }
  // 一級與二級撞名（例如 city=臺北市、suburb 也被判成臺北市）就不重複顯示
  if (district && district === city) district = null;

  return {
    country: normalizeRegion(a.country),
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    city,
    district,
  };
}

/**
 * 打 Nominatim reverse。低流量個人使用符合其使用政策（1 req/s）；
 * 呼叫端請自行節流（批次補資料時每筆間隔 ≥1 秒）。
 */
export async function reverseGeo(lat: number, lng: number): Promise<ReverseGeoResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'local-food-collection/0.1 (personal food map app)',
        'Accept-Language': 'zh-TW',
      },
      // 同一個地點的行政區不會變，快取一天
      next: { revalidate: 86400 },
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as { address?: NominatimAddress; error?: string };
    if (data.error || !data.address) return EMPTY;
    return fromNominatimAddress(data.address);
  } catch {
    return EMPTY;
  }
}
