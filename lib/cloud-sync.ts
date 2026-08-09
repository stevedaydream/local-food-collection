/**
 * 登入後的雲端同步（Supabase restaurants 表）：
 * - pullAndMerge：開頁/登入時拉雲端清單與本機合併（見下方刪除偵測）
 * - schedulePush：每次本機寫入後 debounce 全量推上雲端（upsert + 刪除多餘列）
 * 未登入或未設定 Supabase 時全部 no-op，App 照舊純 localStorage 運作。
 *
 * 合併規則：同 id 以雲端為準（本機變更在每次寫入時已即時推上去）；
 * 「曾同步過但雲端已不存在」的 id 視為其他裝置刪除，不復活——
 * 用 localStorage 記錄上次成功同步的 id 集合來區分「新收藏」與「被刪除」。
 */
import type { SavedRestaurant } from './types';
import { getSupabase } from './supabase';

const SYNCED_IDS_KEY = 'food-map:cloud-synced-ids';
const PUSH_DEBOUNCE_MS = 2000;
const UPSERT_CHUNK = 20;

function loadSyncedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SYNCED_IDS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSyncedIds(ids: string[]) {
  localStorage.setItem(SYNCED_IDS_KEY, JSON.stringify(ids));
}

async function currentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * `google_url` / `district` / `country` / `country_code` 都是後加的欄位。
 * 舊 Supabase 專案還沒跑 ALTER TABLE 時 upsert 會被擋，第一次撞到就記住並改推
 * 不含這些欄的資料（值仍留在本機），同步不會整批失敗。
 */
let hasNewColumns = true;
const MISSING_COLUMN = /google_url|district|country/i;

function toRow(r: SavedRestaurant, ownerId: string) {
  return {
    id: r.id,
    owner_id: ownerId,
    name: r.name,
    address: r.address,
    city: r.city,
    cuisine: r.cuisine,
    dishes: r.dishes,
    price_range: r.priceRange,
    source_platform: r.sourcePlatform,
    notes: r.notes,
    lat: r.lat,
    lng: r.lng,
    thumb: r.thumb,
    visibility: r.visibility ?? 'private',
    favorite: r.favorite ?? false,
    created_at: r.createdAt,
    ...(hasNewColumns
      ? {
          google_url: r.googleUrl ?? null,
          district: r.district ?? null,
          country: r.country ?? null,
          country_code: r.countryCode ?? null,
        }
      : {}),
  };
}

export function fromRow(row: any): SavedRestaurant {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    district: row.district ?? null,
    country: row.country ?? null,
    countryCode: row.country_code ?? null,
    cuisine: row.cuisine,
    dishes: Array.isArray(row.dishes) ? row.dishes : [],
    priceRange: row.price_range,
    sourcePlatform: row.source_platform,
    notes: row.notes,
    lat: row.lat,
    lng: row.lng,
    thumb: row.thumb,
    googleUrl: row.google_url ?? null,
    createdAt: row.created_at,
    visibility: row.visibility === 'friends' ? 'friends' : 'private',
    favorite: !!row.favorite,
  };
}

/** 拉雲端與本機合併。未登入回傳 null；回傳的清單請經 saveRestaurants 存回（會順便觸發 push） */
export async function pullAndMerge(local: SavedRestaurant[]): Promise<SavedRestaurant[] | null> {
  const supabase = getSupabase();
  const uid = await currentUserId();
  if (!supabase || !uid) return null;

  const { data, error } = await supabase.from('restaurants').select('*').eq('owner_id', uid);
  if (error) throw new Error(`同步失敗：${error.message}`);

  const cloud = (data ?? []).map(fromRow);
  const cloudIds = new Set(cloud.map((r) => r.id));
  const syncedIds = loadSyncedIds();
  // 本機獨有：從未同步過的是新收藏要保留；同步過但雲端沒有的是被其他裝置刪除
  const localOnly = local.filter((r) => !cloudIds.has(r.id) && !syncedIds.has(r.id));
  return [...cloud, ...localOnly];
}

/** 登出（或換帳號）時呼叫：清掉同步紀錄，本機資料保留 */
export function clearSyncState() {
  localStorage.removeItem(SYNCED_IDS_KEY);
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** 本機清單變更後呼叫（store.ts 每次寫入自動觸發），debounce 後全量推上雲端 */
export function schedulePush(list: SavedRestaurant[]) {
  if (typeof window === 'undefined' || !getSupabase()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushNow(list).catch(() => {
      /* 離線或未登入：下次寫入/開頁再同步 */
    });
  }, PUSH_DEBOUNCE_MS);
}

async function pushNow(list: SavedRestaurant[]) {
  const supabase = getSupabase();
  const uid = await currentUserId();
  if (!supabase || !uid) return;

  for (let i = 0; i < list.length; i += UPSERT_CHUNK) {
    const slice = list.slice(i, i + UPSERT_CHUNK);
    let { error } = await supabase.from('restaurants').upsert(slice.map((r) => toRow(r, uid)));
    if (error && hasNewColumns && MISSING_COLUMN.test(error.message)) {
      hasNewColumns = false;
      ({ error } = await supabase.from('restaurants').upsert(slice.map((r) => toRow(r, uid))));
    }
    if (error) throw new Error(error.message);
  }

  // 刪掉雲端有、但本機清單已沒有的列（本機為當下的真相）
  const ids = list.map((r) => r.id);
  const del = supabase.from('restaurants').delete().eq('owner_id', uid);
  const { error: delError } = ids.length
    ? await del.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`)
    : await del;
  if (delError) throw new Error(delError.message);

  saveSyncedIds(ids);
}
