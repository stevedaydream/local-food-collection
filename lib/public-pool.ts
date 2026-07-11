/**
 * Phase 3 公共美食庫：
 * - contributeMyList：把收藏的「客觀欄位」送進待審核池（opt-in，備註/截圖/來源絕不上傳）
 * - revokeMyContributions：一鍵撤回（含已收錄進公共庫的列）
 * - fetchPublicNearby：附近模式把審核通過的公共庫店家一起納入骰選
 */
import type { NearbyPlace, SavedRestaurant } from './types';
import { getSupabase } from './supabase';

/** 貢獻前的同意聲明（SettingsSheet confirm 用） */
export const CONTRIBUTE_CONSENT =
  '將把你目前收藏的「客觀資訊」（店名、地址、地區、類型、推薦菜色、價位、座標）' +
  '送交審核，通過後納入所有使用者共享的公共美食庫。\n\n' +
  '不會上傳：個人備註、截圖、收藏來源。\n' +
  '你可以隨時在設定裡一鍵撤回全部貢獻（含已收錄的）。\n\n同意送出嗎？';

export interface ContributionStats {
  pending: number;
  approved: number;
  rejected: number;
}

async function requireUserId(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未設定');
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('請先登入');
  return uid;
}

/** 送出目前清單（重複的 店名+地址 由 unique 約束自動略過），回傳新送出的筆數 */
export async function contributeMyList(list: SavedRestaurant[]): Promise<number> {
  const uid = await requireUserId();
  const supabase = getSupabase()!;
  const rows = list.map((r) => ({
    contributor_id: uid,
    name: r.name,
    address: r.address,
    city: r.city,
    cuisine: r.cuisine,
    dishes: r.dishes,
    price_range: r.priceRange,
    lat: r.lat,
    lng: r.lng,
  }));
  if (!rows.length) return 0;
  // upsert + ignoreDuplicates：已送過的（同店名+地址）不重複建、也不覆蓋審核狀態
  const { data, error } = await supabase
    .from('public_contributions')
    .upsert(rows, { onConflict: 'contributor_id,name,address', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`送出失敗：${error.message}`);
  return data?.length ?? 0;
}

export async function getContributionStats(): Promise<ContributionStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase.from('public_contributions').select('status');
  if (error) return null;
  const stats: ContributionStats = { pending: 0, approved: 0, rejected: 0 };
  for (const row of data ?? []) {
    if (row.status in stats) stats[row.status as keyof ContributionStats]++;
  }
  return stats;
}

/** 撤回自己全部貢獻（RPC 連公共庫已收錄列一起刪），回傳刪除筆數 */
export async function revokeMyContributions(): Promise<number> {
  await requireUserId();
  const supabase = getSupabase()!;
  const { data, error } = await supabase.rpc('revoke_my_contributions');
  if (error) throw new Error(`撤回失敗：${error.message}`);
  return typeof data === 'number' ? data : 0;
}

/** 附近的公共庫店家（約 1.5km 方框，全員可讀不需登入） */
export async function fetchPublicNearby(lat: number, lng: number): Promise<NearbyPlace[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const d = 0.015;
  const { data, error } = await supabase
    .from('public_places')
    .select('name, address, cuisine, lat, lng')
    .gte('lat', lat - d)
    .lte('lat', lat + d)
    .gte('lng', lng - d)
    .lte('lng', lng + d)
    .limit(30);
  if (error) return [];
  return (data ?? []).map((p) => ({
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    rating: null,
    cuisine: p.cuisine,
  }));
}
