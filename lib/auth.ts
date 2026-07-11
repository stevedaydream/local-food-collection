/**
 * Google 登入 → Supabase session。
 * - 瀏覽器 / PWA：GIS 官方「使用 Google 帳戶登入」按鈕取 ID token
 * - Capacitor 殼：GoogleAuthPlugin.getIdToken（Credential Manager 原生流程）
 * 兩邊都拿到 Google ID token 後走 supabase.auth.signInWithIdToken。
 */
import { getSupabase } from './supabase';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export interface AccountInfo {
  userId: string;
  email: string | null;
}

export function isAuthConfigured(): boolean {
  return !!CLIENT_ID && !!getSupabase();
}

export function isInShell(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export async function getAccount(): Promise<AccountInfo | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { userId: user.id, email: user.email ?? null } : null;
}

/** 拿到 Google ID token 後完成 Supabase 登入 + profiles upsert */
async function signInWithGoogleIdToken(idToken: string): Promise<AccountInfo> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 未設定');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw new Error(`登入失敗：${error.message}`);
  const user = data.user!;
  await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email ?? null,
    display_name: (user.user_metadata?.full_name as string) ?? null,
  });
  return { userId: user.id, email: user.email ?? null };
}

/** 殼內：原生 Credential Manager 取 ID token 後登入 */
export async function signInShell(): Promise<AccountInfo> {
  const native = (window as any).Capacitor?.Plugins?.GoogleAuth;
  if (!native?.getIdToken) throw new Error('App 版本過舊，請更新後再登入');
  const { idToken } = await native.getIdToken({ clientId: CLIENT_ID });
  if (!idToken) throw new Error('Google 登入失敗');
  return signInWithGoogleIdToken(idToken);
}

// ---- 瀏覽器：GIS 官方按鈕 ----

let gsiLoading: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if ((window as any).google?.accounts?.id) return Promise.resolve();
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gsiLoading = null;
        reject(new Error('無法載入 Google 登入元件，請檢查網路'));
      };
      document.head.appendChild(s);
    });
  }
  return gsiLoading;
}

/**
 * 在指定容器渲染 GIS 官方登入按鈕；使用者按下並完成登入後呼叫 onSignedIn。
 * 回傳是否成功渲染（未設定 client ID 時 false）。
 */
export async function renderGoogleSignInButton(
  container: HTMLElement,
  onSignedIn: (account: AccountInfo) => void,
  onError: (message: string) => void,
): Promise<boolean> {
  if (!CLIENT_ID) return false;
  await loadGsi();
  const gsi = (window as any).google.accounts.id;
  gsi.initialize({
    client_id: CLIENT_ID,
    callback: async (resp: { credential?: string }) => {
      try {
        if (!resp.credential) throw new Error('Google 沒有回傳憑證');
        onSignedIn(await signInWithGoogleIdToken(resp.credential));
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },
  });
  gsi.renderButton(container, { theme: 'outline', size: 'large', text: 'signin_with', width: 260 });
  return true;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
