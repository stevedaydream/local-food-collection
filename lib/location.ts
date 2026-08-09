/**
 * 「我現在在哪」的單一來源：定位 + 反查 + 快取 + 手動指定。
 *
 * 規則（與使用者確認過的行為）：
 * - 定位快取 5 分鐘；走超過 500m 才重新反查行政區
 * - 定位失敗不再退回台北（那會讓人在日本卻被判成在台灣），改用「上次成功的位置」並標示
 * - 手動指定一直有效，但一旦 GPS 判定你已經在別的國家就自動解除
 */
import { countryOf } from './country-bbox';
import { getPosition } from './geo';

const KEY = 'food-map:location:v1';
const MANUAL_KEY = 'food-map:location-manual:v1';
/** 位置快取多久算新鮮 */
const FRESH_MS = 5 * 60 * 1000;
/** 移動超過這個距離才需要重新反查行政區（公里） */
const REGION_REFRESH_KM = 0.5;

export interface DeviceLocation {
  lat: number;
  lng: number;
  country: string | null;
  countryCode: string | null;
  /** 一級行政區：台北市 / 東京都 */
  city: string | null;
  /** 二級行政區：信義區 / 荒川區 */
  district: string | null;
  /** 取得時間 (ms) */
  at: number;
  source: 'gps' | 'manual';
}

export interface LocationState {
  loc: DeviceLocation | null;
  /** true = 這是快取/上次的位置，不是剛剛量到的 */
  stale: boolean;
  /** 手動指定因為偵測到你已在別的國家而自動解除 */
  manualReleased: boolean;
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 寫不進去就算了，下次再抓 */
  }
}

export const loadCachedLocation = () => read<DeviceLocation>(KEY);
export const loadManualLocation = () => read<DeviceLocation>(MANUAL_KEY);

/** 手動指定所在地（面板用）。座標必填——附近搜尋與距離排序都要它 */
export function setManualLocation(loc: Omit<DeviceLocation, 'at' | 'source'>): DeviceLocation {
  const saved: DeviceLocation = { ...loc, at: Date.now(), source: 'manual' };
  write(MANUAL_KEY, saved);
  write(KEY, saved);
  return saved;
}

export function clearManualLocation() {
  try {
    localStorage.removeItem(MANUAL_KEY);
    // 一般快取裡若是手動指定的那一份也要丟掉，否則按了「回自動」還會一直顯示「手動」
    if (loadCachedLocation()?.source === 'manual') localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 之前成功定位過、或瀏覽器已經給過定位權限 → 可以自動抓，不會突然彈權限視窗。
 * Capacitor 殼內 Permissions API 可能不支援，此時只靠「有沒有成功過」判斷。
 */
export async function canAutoLocate(): Promise<boolean> {
  if (loadManualLocation() || loadCachedLocation()) return true;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

async function fetchRegion(lat: number, lng: number) {
  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    return (await res.json()) as {
      country: string | null;
      countryCode: string | null;
      city: string | null;
      district: string | null;
    };
  } catch {
    return null;
  }
}

/**
 * 取得目前位置（含行政區）。
 * @param force true = 使用者按了「重新定位」，忽略快取與手動指定
 */
export async function resolveLocation(force = false): Promise<LocationState> {
  const cached = loadCachedLocation();
  const manual = loadManualLocation();

  if (!force) {
    if (manual) return { loc: manual, stale: false, manualReleased: false };
    if (cached && Date.now() - cached.at < FRESH_MS) {
      return { loc: cached, stale: false, manualReleased: false };
    }
  }

  const pos = await getPosition();
  // getPosition 定位失敗會回台北並標 fallback；那不是我們的位置，寧可用上次的
  if (pos.fallback) {
    const fallbackLoc = manual ?? cached;
    return { loc: fallbackLoc, stale: !!fallbackLoc, manualReleased: false };
  }

  // 已經到了別的國家 → 手動指定失效（避免回台灣後還一直推日本的店）
  const gpsCountry = countryOf(pos.lat, pos.lng);
  const manualReleased =
    !!manual && !!gpsCountry?.code && !!manual.countryCode && gpsCountry.code !== manual.countryCode;
  if (manual && !manualReleased && !force) {
    return { loc: manual, stale: false, manualReleased: false };
  }
  if (manualReleased) clearManualLocation();

  // 只移動一小段就沿用上次反查到的行政區，少打一次 Nominatim
  const near =
    cached &&
    cached.source === 'gps' &&
    Math.abs(cached.lat - pos.lat) + Math.abs(cached.lng - pos.lng) < REGION_REFRESH_KM / 111;
  const region = near
    ? { country: cached!.country, countryCode: cached!.countryCode, city: cached!.city, district: cached!.district }
    : await fetchRegion(pos.lat, pos.lng);

  const loc: DeviceLocation = {
    lat: pos.lat,
    lng: pos.lng,
    country: region?.country ?? gpsCountry?.name ?? null,
    countryCode: region?.countryCode ?? gpsCountry?.code ?? null,
    city: region?.city ?? null,
    district: region?.district ?? null,
    at: Date.now(),
    source: 'gps',
  };
  write(KEY, loc);
  return { loc, stale: false, manualReleased };
}

/** 「📍 日本 東京都 荒川區」——由粗到細，缺的層級自動略過 */
export function locationLabel(loc: DeviceLocation | null): string {
  if (!loc) return '';
  return [loc.country, loc.city, loc.district].filter(Boolean).join(' ') || '未知位置';
}
