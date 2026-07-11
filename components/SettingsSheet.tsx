'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { getPreferredProvider, setPreferredProvider } from '@/lib/provider-pref';
import { exportJson, importJson, loadRestaurants, saveRestaurants } from '@/lib/store';
import {
  getAccount,
  isAuthConfigured,
  isInShell,
  renderGoogleSignInButton,
  signInShell,
  signOut,
  type AccountInfo,
} from '@/lib/auth';
import { clearSyncState, pullAndMerge } from '@/lib/cloud-sync';
import {
  backupToDrive,
  getLastBackupTime,
  hasNativeGoogleAuth,
  isDriveConfigured,
  isInCapacitorShell,
  restoreFromDrive,
} from '@/lib/google-drive';
import { getLocalConfig } from '@/lib/local-mode';
import LocalSetupSheet from './LocalSetupSheet';

interface ProviderInfo {
  id: string;
  label: string;
}

export default function SettingsSheet({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: (list: SavedRestaurant[]) => void;
}) {
  const [available, setAvailable] = useState<ProviderInfo[] | null>(null);
  const [serverDefault, setServerDefault] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(getPreferredProvider() ?? 'auto');
  const [driveBusy, setDriveBusy] = useState<'backup' | 'restore' | null>(null);
  const [driveMsg, setDriveMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(getLastBackupTime());
  // 帳號與雲端同步
  const [account, setAccount] = useState<AccountInfo | null | 'loading'>('loading');
  const [authMsg, setAuthMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const handleSignedIn = async (acc: AccountInfo) => {
    setAccount(acc);
    setAuthMsg({ text: '登入成功，同步中…' });
    try {
      const merged = await pullAndMerge(loadRestaurants());
      if (merged) {
        saveRestaurants(merged);
        onRestored(merged);
        setAuthMsg({ text: `✅ 同步完成，目前共 ${merged.length} 家收藏` });
      }
    } catch (e) {
      setAuthMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  useEffect(() => {
    if (!isAuthConfigured()) {
      setAccount(null);
      return;
    }
    getAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  // 未登入且在瀏覽器：渲染 GIS 官方登入按鈕
  useEffect(() => {
    if (account !== null || isInShell() || !isAuthConfigured()) return;
    const el = googleBtnRef.current;
    if (!el) return;
    renderGoogleSignInButton(el, handleSignedIn, (m) => setAuthMsg({ text: m, error: true })).catch(
      (e) => setAuthMsg({ text: e instanceof Error ? e.message : String(e), error: true }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const handleShellSignIn = async () => {
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      await handleSignedIn(await signInShell());
    } catch (e) {
      setAuthMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    clearSyncState();
    setAccount(null);
    setAuthMsg({ text: '已登出，收藏仍保留在這台裝置上' });
  };

  const handleBackup = async () => {
    setDriveBusy('backup');
    setDriveMsg(null);
    try {
      await backupToDrive(exportJson());
      setLastBackup(getLastBackupTime());
      setDriveMsg({ text: '✅ 已備份到你的 Google Drive' });
    } catch (e) {
      setDriveMsg({ text: `備份失敗：${e instanceof Error ? e.message : e}`, error: true });
    } finally {
      setDriveBusy(null);
    }
  };

  const handleRestore = async () => {
    setDriveBusy('restore');
    setDriveMsg(null);
    try {
      const json = await restoreFromDrive();
      if (json === null) {
        setDriveMsg({ text: '這個 Google 帳號還沒有備份', error: true });
      } else {
        const merged = importJson(json);
        onRestored(merged);
        setDriveMsg({ text: `✅ 還原完成，目前共 ${merged.length} 家收藏` });
      }
    } catch (e) {
      setDriveMsg({ text: `還原失敗：${e instanceof Error ? e.message : e}`, error: true });
    } finally {
      setDriveBusy(null);
    }
  };

  const [showLocalSetup, setShowLocalSetup] = useState(false);
  const [localConfigured, setLocalConfigured] = useState(false);

  useEffect(() => {
    setLocalConfigured(!!getLocalConfig());
    fetch('/api/providers')
      .then((r) => r.json())
      .then((d) => {
        setAvailable(d.available ?? []);
        setServerDefault(d.default ?? null);
      })
      .catch(() => setAvailable([]));
  }, []);

  const select = (id: string) => {
    if (id === 'local' && !getLocalConfig()) {
      // 還沒設置過本機模式 → 先走教學精靈，完成才切換
      setShowLocalSetup(true);
      return;
    }
    setChoice(id);
    setPreferredProvider(id === 'auto' ? null : id);
  };

  const radioRow = (id: string, label: React.ReactNode, extra?: React.ReactNode) => (
    <label
      key={id}
      style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 4px', fontSize: 15 }}
    >
      <input
        type="radio"
        name="provider"
        style={{ width: 'auto' }}
        checked={choice === id}
        onChange={() => select(id)}
      />
      <span style={{ flex: 1 }}>{label}</span>
      {extra}
    </label>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>👤 帳號與雲端同步</h2>
        {!isAuthConfigured() ? (
          <p className="meta" style={{ fontSize: 12.5 }}>
            伺服器尚未設定 Supabase（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY），暫時無法登入同步。
          </p>
        ) : account === 'loading' ? (
          <p className="meta">
            載入中 <span className="spinner" />
          </p>
        ) : account ? (
          <>
            <p className="meta" style={{ fontSize: 12.5 }}>
              已登入：{account.email ?? account.userId}
              <span style={{ display: 'block' }}>收藏會自動同步到雲端，換裝置登入即可取回。</span>
            </p>
            <div className="sheet-actions" style={{ marginTop: 10 }}>
              <button className="btn secondary" onClick={handleSignOut}>
                登出
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="meta" style={{ fontSize: 12.5 }}>
              用 Google 登入後，收藏自動同步雲端、換裝置不遺失（也是之後朋友分享功能的基礎）。
            </p>
            {isInShell() ? (
              <div className="sheet-actions" style={{ marginTop: 10 }}>
                <button className="btn secondary" disabled={authBusy} onClick={handleShellSignIn}>
                  {authBusy ? <span className="spinner" /> : '使用 Google 登入'}
                </button>
              </div>
            ) : (
              <div ref={googleBtnRef} style={{ marginTop: 10, minHeight: 44 }} />
            )}
          </>
        )}
        {authMsg && (
          <p className={authMsg.error ? 'error-text' : 'meta'} style={{ fontSize: 12.5, marginTop: 8 }}>
            {authMsg.text}
          </p>
        )}

        <h2 style={{ marginTop: 22 }}>⚙️ AI 分析引擎</h2>
        {available === null ? (
          <p className="meta">
            載入中 <span className="spinner" />
          </p>
        ) : (
          <>
            {available.length === 0 && (
              <p className="error-text" style={{ fontSize: 13 }}>
                伺服器尚未設定雲端 AI 金鑰（ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY /
                CUSTOM_BASE_URL），仍可使用下方「本機模式」。
              </p>
            )}
            {available.length > 0 &&
              radioRow(
                'auto',
                <>
                  伺服器預設
                  {serverDefault && (
                    <span className="meta" style={{ display: 'block', fontSize: 12 }}>
                      目前為 {available.find((p) => p.id === serverDefault)?.label ?? serverDefault}
                    </span>
                  )}
                </>,
              )}
            {available.map((p) => radioRow(p.id, p.label))}

            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />

            {radioRow(
              'local',
              <>
                📱 本機模式（瀏覽器直連裝置上的模型）
                <span className="meta" style={{ display: 'block', fontSize: 12 }}>
                  {localConfigured
                    ? `已設置：${getLocalConfig()?.model} @ ${getLocalConfig()?.baseUrl}`
                    : '截圖不上雲端，適合手機/電腦跑 Gemma 等本機模型'}
                </span>
              </>,
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.preventDefault();
                  setShowLocalSetup(true);
                }}
              >
                {localConfigured ? '編輯' : '設置 →'}
              </button>,
            )}
          </>
        )}
        <h2 style={{ marginTop: 22 }}>☁️ Google Drive 備份</h2>
        {!isDriveConfigured() ? (
          <p className="meta" style={{ fontSize: 12.5 }}>
            伺服器尚未設定 NEXT_PUBLIC_GOOGLE_CLIENT_ID，暫時無法使用雲端備份。
            仍可用名單下方的「匯出備份 / 匯入」手動備份。
          </p>
        ) : isInCapacitorShell() && !hasNativeGoogleAuth() ? (
          <p className="meta" style={{ fontSize: 12.5 }}>
            這個版本的 App 尚不支援 Google 登入，請更新 App，
            或改用瀏覽器 / PWA 版備份、名單下方的「匯出備份 / 匯入」。
          </p>
        ) : (
          <>
            <p className="meta" style={{ fontSize: 12.5 }}>
              免設定：點下方按鈕選擇 Google 帳號即可。備份存在你 Drive
              的隱藏應用程式空間，App 碰不到你的其他檔案。
              {lastBackup && (
                <span style={{ display: 'block' }}>
                  上次備份：{new Date(lastBackup).toLocaleString()}
                </span>
              )}
            </p>
            <div className="sheet-actions" style={{ marginTop: 10 }}>
              <button className="btn secondary" disabled={!!driveBusy} onClick={handleBackup}>
                {driveBusy === 'backup' ? <span className="spinner" /> : '☁️ 備份到雲端'}
              </button>
              <button className="btn secondary" disabled={!!driveBusy} onClick={handleRestore}>
                {driveBusy === 'restore' ? <span className="spinner" /> : '⬇️ 從雲端還原'}
              </button>
            </div>
            {driveMsg && (
              <p className={driveMsg.error ? 'error-text' : 'meta'} style={{ fontSize: 12.5, marginTop: 8 }}>
                {driveMsg.text}
              </p>
            )}
          </>
        )}
        <div className="sheet-actions">
          <button className="btn secondary" onClick={onClose}>
            完成
          </button>
        </div>

        {showLocalSetup && (
          <LocalSetupSheet
            onDone={(configured) => {
              setShowLocalSetup(false);
              setLocalConfigured(configured);
              if (configured) {
                setChoice('local');
                setPreferredProvider('local');
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
