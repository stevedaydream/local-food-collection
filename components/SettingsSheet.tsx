'use client';

import { useEffect, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { getPreferredProvider, setPreferredProvider } from '@/lib/provider-pref';
import { exportJson, importJson } from '@/lib/store';
import {
  backupToDrive,
  getLastBackupTime,
  isDriveConfigured,
  isInCapacitorShell,
  restoreFromDrive,
} from '@/lib/google-drive';

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

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then((d) => {
        setAvailable(d.available ?? []);
        setServerDefault(d.default ?? null);
      })
      .catch(() => setAvailable([]));
  }, []);

  const select = (id: string) => {
    setChoice(id);
    setPreferredProvider(id === 'auto' ? null : id);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>⚙️ AI 分析引擎</h2>
        {available === null ? (
          <p className="meta">
            載入中 <span className="spinner" />
          </p>
        ) : available.length === 0 ? (
          <p className="error-text">
            伺服器尚未設定任何 AI provider。請在部署環境變數中設定至少一組金鑰
            （ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / CUSTOM_BASE_URL）。
          </p>
        ) : (
          <>
            <label
              style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 4px', fontSize: 15 }}
            >
              <input
                type="radio"
                name="provider"
                style={{ width: 'auto' }}
                checked={choice === 'auto'}
                onChange={() => select('auto')}
              />
              <span>
                伺服器預設
                {serverDefault && (
                  <span className="meta" style={{ display: 'block', fontSize: 12 }}>
                    目前為 {available.find((p) => p.id === serverDefault)?.label ?? serverDefault}
                  </span>
                )}
              </span>
            </label>
            {available.map((p) => (
              <label
                key={p.id}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 4px', fontSize: 15 }}
              >
                <input
                  type="radio"
                  name="provider"
                  style={{ width: 'auto' }}
                  checked={choice === p.id}
                  onChange={() => select(p.id)}
                />
                {p.label}
              </label>
            ))}
            <p className="meta" style={{ marginTop: 10, fontSize: 12.5 }}>
              自訂 Endpoint 走 OpenAI 相容 API（/v1/chat/completions），之後要接手機上的
              Gemma，只要在伺服器環境變數填 CUSTOM_BASE_URL / CUSTOM_MODEL 即可。
            </p>
          </>
        )}
        <h2 style={{ marginTop: 22 }}>☁️ Google Drive 備份</h2>
        {!isDriveConfigured() ? (
          <p className="meta" style={{ fontSize: 12.5 }}>
            伺服器尚未設定 NEXT_PUBLIC_GOOGLE_CLIENT_ID，暫時無法使用雲端備份。
            仍可用名單下方的「匯出備份 / 匯入」手動備份。
          </p>
        ) : isInCapacitorShell() ? (
          <p className="meta" style={{ fontSize: 12.5 }}>
            Android App 殼內暫不支援 Google 登入，請改用瀏覽器或 PWA 版備份，
            或用名單下方的「匯出備份 / 匯入」。
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
      </div>
    </div>
  );
}
