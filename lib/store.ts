import type { SavedRestaurant } from './types';
import { syncToWidget } from './widget-sync';
import { schedulePush } from './cloud-sync';

const KEY = 'food-map:restaurants:v1';

export function loadRestaurants(): SavedRestaurant[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedRestaurant[]) : [];
  } catch {
    return [];
  }
}

export function saveRestaurants(list: SavedRestaurant[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // localStorage 滿了 — 移除縮圖再試一次，資料本身優先保留
    const slim = list.map((r) => ({ ...r, thumb: null }));
    localStorage.setItem(KEY, JSON.stringify(slim));
  }
  syncToWidget(list);
  schedulePush(list);
}

export function addRestaurants(items: SavedRestaurant[]): SavedRestaurant[] {
  const list = [...items, ...loadRestaurants()];
  saveRestaurants(list);
  return list;
}

export function updateRestaurant(item: SavedRestaurant): SavedRestaurant[] {
  const list = loadRestaurants().map((r) => (r.id === item.id ? item : r));
  saveRestaurants(list);
  return list;
}

export function removeRestaurant(id: string): SavedRestaurant[] {
  const list = loadRestaurants().filter((r) => r.id !== id);
  saveRestaurants(list);
  return list;
}

export function exportJson(): string {
  return JSON.stringify(loadRestaurants(), null, 2);
}

export function importJson(json: string): SavedRestaurant[] {
  const incoming = JSON.parse(json) as SavedRestaurant[];
  if (!Array.isArray(incoming)) throw new Error('格式錯誤');
  const existing = loadRestaurants();
  const ids = new Set(existing.map((r) => r.id));
  const merged = [...existing, ...incoming.filter((r) => r.id && !ids.has(r.id))];
  saveRestaurants(merged);
  return merged;
}

/**
 * Google Maps 連結 — 存過店家連結（貼連結/自動查詢帶入）就用它，會直接開店家頁；
 * 否則有座標用座標，最後退回店名+地址搜尋。
 */
export function mapsUrl(
  r: Pick<SavedRestaurant, 'name' | 'address' | 'lat' | 'lng'> & { googleUrl?: string | null },
): string {
  if (r.googleUrl) return r.googleUrl;
  if (r.lat != null && r.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`;
  }
  const q = encodeURIComponent([r.name, r.address].filter(Boolean).join(' '));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
