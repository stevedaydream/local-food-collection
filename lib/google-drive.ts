/**
 * 免設定 Google Drive 備份：前端用 Google Identity Services 取 token，
 * 備份存進 Drive 隱藏的 appDataFolder（只碰得到本 App 自己的檔案）。
 * 開發者設定一次 NEXT_PUBLIC_GOOGLE_CLIENT_ID 即可，使用者只要選 Google 帳號。
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_NAME = 'food-map-backup.json';
const LAST_BACKUP_KEY = 'food-map:drive-last-backup';

export function isDriveConfigured(): boolean {
  // 殼內走原生授權（靠 Android OAuth client 的 package+SHA-1），不需要 web client ID
  return !!CLIENT_ID || hasNativeGoogleAuth();
}

/** Capacitor 殼的 WebView 會被 Google OAuth 擋（disallowed_useragent） */
export function isInCapacitorShell(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** 殼內是否有原生 Google 授權 plugin（舊版 APK 沒有 → 需更新 App） */
export function hasNativeGoogleAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.Plugins?.GoogleAuth;
}

export function getLastBackupTime(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_BACKUP_KEY);
}

// ---- Google Identity Services ----

let gsiLoading: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
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

let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;

  // Capacitor 殼內：WebView 跑不了 GIS popup，改走原生 Google 授權 plugin
  if (isInCapacitorShell()) {
    const native = (window as any).Capacitor?.Plugins?.GoogleAuth;
    if (!native) throw new Error('App 版本過舊，請更新後再使用雲端備份');
    const { accessToken } = await native.getAccessToken();
    if (!accessToken) throw new Error('Google 授權失敗');
    // 原生流程拿不到 expires_in，保守抓 45 分鐘；過期會被 401 重授權接住
    tokenCache = { token: accessToken, exp: Date.now() + 45 * 60_000 };
    return accessToken;
  }

  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
        if (!resp.access_token) {
          reject(new Error(resp.error ?? 'Google 授權失敗'));
          return;
        }
        tokenCache = {
          token: resp.access_token,
          exp: Date.now() + (resp.expires_in ?? 3600) * 1000,
        };
        resolve(resp.access_token);
      },
      error_callback: (e: { message?: string; type?: string }) => {
        reject(
          new Error(e?.type === 'popup_closed' ? '登入視窗被關閉' : (e?.message ?? 'Google 授權失敗')),
        );
      },
    });
    client.requestAccessToken();
  });
}

// ---- Drive REST（appDataFolder）----

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await getToken();
  let res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    // token 被撤銷或過期：清掉快取重新授權一次
    tokenCache = null;
    token = await getToken();
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  }
  if (!res.ok) throw new Error(`Google Drive 回應 ${res.status}`);
  return res;
}

async function findBackupFile(): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name='${BACKUP_NAME}'`);
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=1`,
  );
  const data = await res.json();
  return data.files?.[0] ?? null;
}

function multipartBody(metadata: object, json: string): { body: Blob; contentType: string } {
  const boundary = 'food-map-backup-boundary';
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`,
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

/** 把整份收藏 JSON 備份到 Drive appDataFolder（同名檔案覆蓋更新） */
export async function backupToDrive(json: string): Promise<void> {
  const existing = await findBackupFile();
  const { body, contentType } = existing
    ? multipartBody({}, json)
    : multipartBody({ name: BACKUP_NAME, parents: ['appDataFolder'] }, json);
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  await driveFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

/** 從 Drive 取回備份 JSON；沒有備份檔回傳 null */
export async function restoreFromDrive(): Promise<string | null> {
  const existing = await findBackupFile();
  if (!existing) return null;
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`);
  return res.text();
}
