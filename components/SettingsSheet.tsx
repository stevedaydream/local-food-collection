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
import { tryAcceptPendingInvite } from '@/lib/friends';
import {
  CONTRIBUTE_CONSENT,
  contributeMyList,
  getContributionStats,
  revokeMyContributions,
  type ContributionStats,
} from '@/lib/public-pool';
import {
  backupToDrive,
  getLastBackupTime,
  hasNativeGoogleAuth,
  isDriveConfigured,
  isInCapacitorShell,
  restoreFromDrive,
} from '@/lib/google-drive';
import { getLocalConfig } from '@/lib/local-mode';
import { loadThemeChoice, saveThemeChoice, type ThemeChoice } from '@/lib/theme';
import { splitCityDistrict } from '@/lib/place-url';
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
      // 開邀請連結但當時未登入 → 現在補加好友
      const inviteMsg = await tryAcceptPendingInvite();
      if (inviteMsg) setAuthMsg({ text: inviteMsg });
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
    setPubStats(null);
    setAuthMsg({ text: '已登出，收藏仍保留在這台裝置上' });
  };

  // 公共美食庫
  const [pubStats, setPubStats] = useState<ContributionStats | null>(null);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubMsg, setPubMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (account && account !== 'loading') getContributionStats().then(setPubStats).catch(() => {});
  }, [account]);

  const handleContribute = async () => {
    if (!confirm(CONTRIBUTE_CONSENT)) return;
    setPubBusy(true);
    setPubMsg(null);
    try {
      const n = await contributeMyList(loadRestaurants());
      setPubStats(await getContributionStats());
      setPubMsg({ text: n ? `✅ 已送出 ${n} 家等待審核，感謝貢獻！` : '沒有新的可送出（都送過了）' });
    } catch (e) {
      setPubMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setPubBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('確定要撤回你全部的貢獻？已收錄進公共庫的也會一併移除。')) return;
    setPubBusy(true);
    setPubMsg(null);
    try {
      const n = await revokeMyContributions();
      setPubStats(await getContributionStats());
      setPubMsg({ text: `已撤回 ${n} 筆貢獻` });
    } catch (e) {
      setPubMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setPubBusy(false);
    }
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

  // 外觀（淺色 / 深色 / 跟隨系統）
  const [theme, setTheme] = useState<ThemeChoice>('auto');
  useEffect(() => setTheme(loadThemeChoice()), []);
  const chooseTheme = (next: ThemeChoice) => {
    setTheme(next);
    saveThemeChoice(next);
    // 通知標題列那顆開關同步
    window.dispatchEvent(new Event('food-map:theme'));
  };

  // 補齊地區資料（縣市 / 行政區 / 國家）
  const [geoBusy, setGeoBusy] = useState('');
  const [geoMsg, setGeoMsg] = useState<{ text: string; error?: boolean } | null>(null);

  /**
   * 把有座標但缺 district / countryCode 的舊收藏反查補齊。
   * Nominatim 政策是 1 req/s，所以每筆間隔 1.1 秒慢慢跑，並顯示進度。
   */
  const handleBackfillRegions = async () => {
    const all = loadRestaurants();
    const byId = new Map(all.map((r) => [r.id, r]));

    // 先在本機把「兩層黏在一起」的舊資料拆開（例如 city='台北 大安區'），不用連網
    let split = 0;
    for (const r of all) {
      if (r.district || !r.city) continue;
      const parts = splitCityDistrict(r.city);
      if (parts.district) {
        byId.set(r.id, { ...r, city: parts.city, district: parts.district });
        split++;
      }
    }

    // 有座標的再反查，補上正式的縣市／行政區／國家
    const targets = all.filter(
      (r) => r.lat != null && r.lng != null && (!r.district || !r.countryCode),
    );
    if (!targets.length && !split) {
      setGeoMsg({ text: '所有收藏都已經有地區資料了。' });
      return;
    }
    setGeoMsg(null);
    let done = 0;
    for (const target of targets) {
      // 拿拆過的那一份當底，反查結果再蓋上去
      const r = byId.get(target.id) ?? target;
      setGeoBusy(`補齊中… ${++done}/${targets.length}`);
      try {
        const res = await fetch(`/api/reverse-geocode?lat=${r.lat}&lng=${r.lng}`);
        const g = (await res.json()) as {
          country: string | null;
          countryCode: string | null;
          city: string | null;
          district: string | null;
        };
        if (g.countryCode || g.city || g.district) {
          byId.set(r.id, {
            ...r,
            city: g.city ?? r.city,
            district: g.district ?? r.district ?? null,
            country: g.country ?? r.country ?? null,
            countryCode: g.countryCode ?? r.countryCode ?? null,
          });
        }
      } catch {
        /* 單筆失敗略過，下次再補 */
      }
      if (done < targets.length) await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    const merged = all.map((r) => byId.get(r.id) ?? r);
    saveRestaurants(merged);
    onRestored(merged);
    setGeoBusy('');
    setGeoMsg({
      text: [
        split ? `拆開 ${split} 筆黏在一起的地區` : '',
        targets.length ? `反查補齊 ${targets.length} 筆的縣市／行政區／國家` : '',
      ]
        .filter(Boolean)
        .join('、') + '。',
    });
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

  const themeRow = (value: ThemeChoice, label: string, hint: string) => (
    <label
      key={value}
      style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 4px', fontSize: 15 }}
    >
      <input
        type="radio"
        name="theme"
        style={{ width: 'auto' }}
        checked={theme === value}
        onChange={() => chooseTheme(value)}
      />
      <span style={{ flex: 1 }}>
        {label}
        <span className="meta" style={{ display: 'block', fontSize: 12 }}>
          {hint}
        </span>
      </span>
    </label>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>🎨 外觀</h2>
        {themeRow('auto', '跟隨系統', '手機切換深色模式時一起換')}
        {themeRow('light', '淺色', '白磁底、青磁重點色')}
        {themeRow('dark', '深色', '同一組釉色的夜間版')}

        <h2 style={{ marginTop: 22 }}>👤 帳號與雲端同步</h2>
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
        <h2 style={{ marginTop: 22 }}>📍 地區資料</h2>
        <p className="meta" style={{ fontSize: 12.5 }}>
          「🎲 吃什麼」會只推薦你目前所在國家的店，靠的是每筆收藏的縣市 / 行政區 / 國家。
          舊收藏只有座標、沒有這些欄位，可以按下面補齊（每秒一筆，會跑一下）。
        </p>
        <div className="sheet-actions" style={{ marginTop: 10 }}>
          <button className="btn secondary" disabled={!!geoBusy} onClick={handleBackfillRegions}>
            {geoBusy ? (
              <>
                <span className="spinner" /> {geoBusy}
              </>
            ) : (
              '📍 補齊地區資料'
            )}
          </button>
        </div>
        {geoMsg && (
          <p className={geoMsg.error ? 'error-text' : 'meta'} style={{ fontSize: 12.5, marginTop: 8 }}>
            {geoMsg.text}
          </p>
        )}

        {account && account !== 'loading' && (
          <>
            <h2 style={{ marginTop: 22 }}>🌍 公共美食庫</h2>
            <p className="meta" style={{ fontSize: 12.5 }}>
              自願把收藏的客觀資訊（店名、地址、類型等）貢獻給所有使用者共享的公共美食庫，
              審核後會出現在大家的「📍 附近」推薦裡。<b>不會</b>上傳備註、截圖與收藏來源，隨時可撤回。
              {pubStats && (pubStats.pending || pubStats.approved || pubStats.rejected) ? (
                <span style={{ display: 'block' }}>
                  我的貢獻：待審核 {pubStats.pending}・已收錄 {pubStats.approved}
                </span>
              ) : null}
            </p>
            <div className="sheet-actions" style={{ marginTop: 10 }}>
              <button className="btn secondary" disabled={pubBusy} onClick={handleContribute}>
                {pubBusy ? <span className="spinner" /> : '🌍 貢獻我的清單'}
              </button>
              {pubStats && pubStats.pending + pubStats.approved + pubStats.rejected > 0 && (
                <button className="btn secondary" disabled={pubBusy} onClick={handleRevoke}>
                  撤回全部
                </button>
              )}
            </div>
            {pubMsg && (
              <p className={pubMsg.error ? 'error-text' : 'meta'} style={{ fontSize: 12.5, marginTop: 8 }}>
                {pubMsg.text}
              </p>
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
        {!isInCapacitorShell() && (
          <>
            <h2 style={{ marginTop: 22 }}>📲 Android App</h2>
            <p className="meta" style={{ fontSize: 12.5 }}>
              安裝 App 版可直接分享截圖給美食收集，用起來更順手。
            </p>
            <div className="sheet-actions" style={{ marginTop: 10 }}>
              <a
                className="btn secondary"
                href="https://github.com/stevedaydream/local-food-collection/releases"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', textAlign: 'center' }}
              >
                ⬇️ 下載 Android App（GitHub Releases）
              </a>
            </div>
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
