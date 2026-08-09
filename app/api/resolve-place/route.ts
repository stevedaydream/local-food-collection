import { NextResponse } from 'next/server';
import { buildGoogleUrl, findUrl, guessCity, isMapsUrl, isShortUrl, parseMapsUrl } from '@/lib/place-url';

export const maxDuration = 25;

/**
 * 「貼一段東西就自動填好」的萬用解析入口，兩個方向都吃：
 * - 貼地址（或店名）→ 找出店名 + 正式地址 + 座標 + Google 地圖連結
 * - 貼 Google 地圖連結（含 maps.app.goo.gl 短網址）→ 展開後抓店名 + 地址 + 座標
 *
 * 有 `GOOGLE_MAPS_API_KEY` 走 Google Places v1（最準，回得到 place_id）；
 * 未設定則退回 OpenStreetMap Nominatim（免 key，小店常常查不到）。
 */

/** 短網址展開要像瀏覽器，否則 Google 可能不給 302 */
const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryTypeDisplayName';

/** Nearby Search 用的餐飲類型（Places v1 Table A） */
const FOOD_TYPES = ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'ice_cream_shop'];

/** Text Search 回的結果只是「一個地址」而不是店家時的類型 */
const ADDRESS_TYPES = [
  'street_address', 'premise', 'subpremise', 'route', 'geocode',
  'postal_code', 'plus_code', 'locality', 'political', 'point_of_interest',
];

interface Place {
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  cuisine: string | null;
  types: string[];
}

const EMPTY: Place = { name: null, address: null, lat: null, lng: null, placeId: null, cuisine: null, types: [] };

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
}

function toPlace(p: GooglePlace): Place {
  return {
    name: p.displayName?.text ?? null,
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    placeId: p.id ?? null,
    cuisine: p.primaryTypeDisplayName?.text ?? null,
    types: p.types ?? [],
  };
}

const isFood = (p: Place) => p.types.some((t) => FOOD_TYPES.includes(t) || t === 'food');
/** 只有地址類型、又不是餐飲 → 代表使用者貼的是地址，店名還得再找 */
const isAddressOnly = (p: Place) => !isFood(p) && (p.types.length === 0 || p.types.every((t) => ADDRESS_TYPES.includes(t)));

/** 展開 Google 短網址；拿不到 Location 就從回應 HTML 裡撈長網址 */
async function expandUrl(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 5 && isShortUrl(current); hop++) {
    let res: Response;
    try {
      res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': UA }, cache: 'no-store' });
    } catch {
      return current;
    }
    const location = res.headers.get('location');
    if (location) {
      try {
        current = new URL(location, current).toString();
      } catch {
        return current;
      }
      continue;
    }
    // 沒有轉址標頭：短網址頁面通常把長網址寫在 HTML 裡
    try {
      const html = await res.text();
      const found = html.match(/https:\/\/www\.google\.[a-z.]+\/maps\/[^"'\\<>\s]+/);
      if (!found) return current;
      current = found[0].replace(/&amp;/g, '&');
    } catch {
      return current;
    }
    break;
  }
  return current;
}

/** 連結帶座標時，搜尋要「限制」在那附近，否則同名連鎖店會抓到別的分店（甚至別的國家） */
const NEAR_DEG = 0.01; // 約 1 公里
/** 反查結果離連結座標超過這個距離就當成配對錯誤 (km) */
const MAX_DRIFT_KM = 3;

function near(p: { lat: number; lng: number }) {
  return {
    rectangle: {
      low: { latitude: p.lat - NEAR_DEG, longitude: p.lng - NEAR_DEG },
      high: { latitude: p.lat + NEAR_DEG, longitude: p.lng + NEAR_DEG },
    },
  };
}

/** 粗略距離（km），只用來判斷「是不是根本不是同一家」 */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

async function googleTextSearch(
  key: string,
  q: string,
  restrictTo?: { lat: number; lng: number },
): Promise<Place[]> {
  const body: Record<string, unknown> = { textQuery: q, languageCode: 'zh-TW', maxResultCount: 5 };
  if (restrictTo) body.locationRestriction = near(restrictTo);
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).map(toPlace);
}

/** 連結帶 place_id 時直接查詳情，最準 */
async function googleDetails(key: string, placeId: string): Promise<Place | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=zh-TW`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,primaryTypeDisplayName',
    },
  });
  if (!res.ok) return null;
  return toPlace((await res.json()) as GooglePlace);
}

/** 只有座標／只有地址時，找那個點附近最近的餐飲店家來補店名 */
async function googleNearbyFood(key: string, lat: number, lng: number, radius: number): Promise<Place[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify({
      includedTypes: FOOD_TYPES,
      maxResultCount: 5,
      rankPreference: 'DISTANCE',
      languageCode: 'zh-TW',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).map(toPlace);
}

interface OsmItem {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  addresstype?: string;
  category?: string;
}

/** Nominatim 的 name 可能是路名／行政區，那不是店名 */
const OSM_NOT_A_SHOP = ['highway', 'boundary', 'place', 'landuse', 'natural', 'railway'];
const OSM_NOT_A_SHOP_TYPE = ['road', 'postcode', 'suburb', 'city', 'town', 'village', 'state', 'county', 'neighbourhood', 'quarter'];

function fromOsm(item: OsmItem): Place {
  const isShop =
    !OSM_NOT_A_SHOP.includes(item.category ?? '') &&
    !OSM_NOT_A_SHOP_TYPE.includes(item.addresstype ?? '');
  return {
    name: isShop ? item.name?.trim() || null : null,
    address: item.display_name ?? null,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    placeId: null,
    cuisine: null,
    types: [],
  };
}

async function osmSearch(q: string, restrictTo?: { lat: number; lng: number }): Promise<Place | null> {
  // viewbox + bounded=1：只在連結指的那一帶找，避免抓到同名的別家分店
  const box = restrictTo
    ? `&bounded=1&viewbox=${restrictTo.lng - NEAR_DEG},${restrictTo.lat + NEAR_DEG},${restrictTo.lng + NEAR_DEG},${restrictTo.lat - NEAR_DEG}`
    : '';
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}${box}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'local-food-collection/0.1 (personal food map app)' },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as OsmItem[];
  return data.length ? fromOsm(data[0]) : null;
}

async function osmReverse(lat: number, lng: number): Promise<Place | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'local-food-collection/0.1 (personal food map app)' },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const item = (await res.json()) as OsmItem & { error?: string };
  if (item.error || !item.lat) return null;
  return fromOsm(item);
}

/** 貼 Google 地圖連結 → 展開 → 用網址線索查回完整店家資料 */
async function fromLink(key: string | undefined, url: string) {
  const expanded = await expandUrl(url);
  const hint = parseMapsUrl(expanded);
  if (!hint.name && !hint.placeId && hint.lat == null) {
    return { place: EMPTY, googleUrl: expanded, resolved: false, note: null };
  }

  const at = hint.lat != null && hint.lng != null ? { lat: hint.lat, lng: hint.lng } : undefined;
  let place: Place | null = null;
  if (key) {
    if (hint.placeId) place = await googleDetails(key, hint.placeId);
    if (!place?.address && hint.name) place = (await googleTextSearch(key, hint.name, at))[0] ?? place;
    if (!place?.address && at) place = (await googleNearbyFood(key, at.lat, at.lng, 100))[0] ?? place;
  } else {
    if (hint.name) place = await osmSearch(hint.name, at);
    if (!place && at) place = await osmReverse(at.lat, at.lng);
  }

  // 反查到的店離連結座標太遠 → 認錯人了，只留連結本身的線索
  if (place && at && place.lat != null && place.lng != null) {
    if (distanceKm({ lat: place.lat, lng: place.lng }, at) > MAX_DRIFT_KM) place = null;
  }

  const merged: Place = {
    // 網址裡的店名是使用者當初看到的招牌，優先於反查結果
    name: hint.name && !place?.placeId ? hint.name : place?.name ?? hint.name,
    address: place?.address ?? null,
    // 連結自帶座標時以它為準（`!3d!4d` 就是店家實際位置）
    lat: at?.lat ?? place?.lat ?? null,
    lng: at?.lng ?? place?.lng ?? null,
    placeId: place?.placeId ?? hint.placeId,
    cuisine: place?.cuisine ?? null,
    types: place?.types ?? [],
  };
  // 查到 place_id 就用乾淨的正規連結，否則保留使用者原本那條（展開後）連結
  const googleUrl = merged.placeId ? buildGoogleUrl(merged) : expanded;
  return {
    place: merged,
    googleUrl,
    resolved: !!(merged.name || merged.address),
    note: merged.address ? null : '連結裡沒有地址資訊，請自己補上地址',
  };
}

const ADDRESS_HINT = /[路街巷弄號段]|大道/;
/** Nominatim 對台灣門牌號幾乎查不到，退一步用「到路名為止」再查一次 */
const looseAddress = (text: string) => text.replace(/\d+(?:[-之]\d+)?號.*$/, '').trim();

/** 貼地址或店名 → 找出店家（地址類結果再往附近找一次餐飲店名） */
async function fromText(key: string | undefined, text: string) {
  let place: Place | null = null;
  let note: string | null = null;

  if (key) {
    const candidates = await googleTextSearch(key, text);
    place = candidates.find(isFood) ?? candidates[0] ?? null;
    if (place && isAddressOnly(place) && place.lat != null && place.lng != null) {
      const near = await googleNearbyFood(key, place.lat, place.lng, 80);
      if (near[0]) {
        // 地址以 Text Search 的正式地址為準，店名用最近的餐飲店家
        place = { ...near[0], address: near[0].address ?? place.address };
      }
    }
  } else {
    place = await osmSearch(text);
    const loose = looseAddress(text);
    if (!place && loose && loose !== text) place = await osmSearch(loose);
    if (place && ADDRESS_HINT.test(text)) {
      // 使用者貼的門牌比 Nominatim 的路段層級結果精確，位址保留原文、只借座標
      place = { ...place, address: text };
    }
    if (place && !place.name) note = '沒有設定 Google 金鑰，只查到位置，店名請自己補';
  }

  if (!place) return { place: EMPTY, googleUrl: null, resolved: false, note: null };
  return {
    place,
    googleUrl: buildGoogleUrl(place),
    resolved: !!(place.name || place.address),
    note,
  };
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('q')?.trim();
  if (!raw) return NextResponse.json({ error: 'missing q' }, { status: 400 });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  const url = findUrl(raw);
  const kind = url && isMapsUrl(url) ? 'link' : 'text';

  try {
    const { place, googleUrl, resolved, note } =
      kind === 'link' ? await fromLink(key, url!) : await fromText(key, raw);

    return NextResponse.json({
      name: place.name,
      address: place.address,
      city: guessCity(place.address) ?? guessCity(kind === 'text' ? raw : null),
      cuisine: place.cuisine,
      lat: place.lat,
      lng: place.lng,
      googleUrl: resolved ? googleUrl : null,
      kind,
      source: key ? 'google' : 'osm',
      message: resolved
        ? note
        : kind === 'link'
          ? '這個連結看不出是哪家店，請改貼「複製連結」拿到的地圖網址，或直接貼地址'
          : '查不到這個地址／店名，試著補上縣市或路名再試一次',
    });
  } catch {
    return NextResponse.json({
      ...EMPTY,
      city: null,
      googleUrl: null,
      kind,
      source: key ? 'google' : 'osm',
      message: '連線失敗，請確認網路後再試',
    });
  }
}
