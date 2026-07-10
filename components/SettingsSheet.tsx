'use client';

import { useEffect, useState } from 'react';
import { getPreferredProvider, setPreferredProvider } from '@/lib/provider-pref';
import { getLocalConfig } from '@/lib/local-mode';
import LocalSetupSheet from './LocalSetupSheet';

interface ProviderInfo {
  id: string;
  label: string;
}

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [available, setAvailable] = useState<ProviderInfo[] | null>(null);
  const [serverDefault, setServerDefault] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(getPreferredProvider() ?? 'auto');
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
        <h2>⚙️ AI 分析引擎</h2>
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
