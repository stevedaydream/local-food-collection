/**
 * Phase 2 朋友機制：邀請連結加好友、互看 visibility='friends' 的收藏。
 * 新增好友一律走 accept_invite RPC（SECURITY DEFINER），前端只負責產生/接受邀請碼。
 */
import type { SavedRestaurant } from './types';
import { getSupabase } from './supabase';
import { fromRow } from './cloud-sync';

const PENDING_INVITE_KEY = 'food-map:pending-invite';

export interface Friend {
  id: string;
  email: string | null;
  displayName: string | null;
}

function randomCode(len = 10): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** 產生邀請連結（7 天有效） */
export async function createInviteLink(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未設定');
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('請先登入');
  const code = randomCode();
  const { error } = await supabase.from('invites').insert({ code, inviter_id: uid });
  if (error) throw new Error(`建立邀請失敗：${error.message}`);
  return `${window.location.origin}/?invite=${code}`;
}

/** 接受邀請碼，成功回傳對方資料 */
export async function acceptInvite(code: string): Promise<Friend> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未設定');
  const { data, error } = await supabase.rpc('accept_invite', { invite_code: code });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('邀請連結無效或已過期');
  return { id: row.friend_id, email: row.friend_email, displayName: row.friend_name };
}

/** 開連結時還沒登入 → 先存起來，登入後再接受 */
export function stashPendingInvite(code: string) {
  localStorage.setItem(PENDING_INVITE_KEY, code);
}

export function hasPendingInvite(): boolean {
  return !!localStorage.getItem(PENDING_INVITE_KEY);
}

/** 有暫存的邀請碼且已登入就接受；回傳結果訊息（沒有暫存回傳 null） */
export async function tryAcceptPendingInvite(): Promise<string | null> {
  const code = localStorage.getItem(PENDING_INVITE_KEY);
  if (!code) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null; // 還沒登入，保留等下次
  localStorage.removeItem(PENDING_INVITE_KEY);
  try {
    const friend = await acceptInvite(code);
    return `🎉 已和 ${friend.displayName ?? friend.email ?? '朋友'} 成為好友`;
  } catch (e) {
    return `加好友失敗：${e instanceof Error ? e.message : e}`;
  }
}

export async function listFriends(): Promise<Friend[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a, user_b')
    .or(`user_a.eq.${uid},user_b.eq.${uid}`);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((f) => (f.user_a === uid ? f.user_b : f.user_a));
  if (!ids.length) return [];
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .in('id', ids);
  if (pError) throw new Error(pError.message);
  return (profiles ?? []).map((p) => ({ id: p.id, email: p.email, displayName: p.display_name }));
}

export async function removeFriend(friendId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  const [a, b] = uid < friendId ? [uid, friendId] : [friendId, uid];
  const { error } = await supabase.from('friendships').delete().eq('user_a', a).eq('user_b', b);
  if (error) throw new Error(error.message);
}

/** 朋友分享的收藏（RLS 只放行 visibility='friends'） */
export async function fetchFriendRestaurants(friendId: string): Promise<SavedRestaurant[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('owner_id', friendId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}
