'use client';

import { useEffect, useState } from 'react';
import { getPreferredProvider, setPreferredProvider } from '@/lib/provider-pref';

interface ProviderInfo {
  id: string;
  label: string;
}

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [available, setAvailable] = useState<ProviderInfo[] | null>(null);
  const [serverDefault, setServerDefault] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(getPreferredProvider() ?? 'auto');

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
        <div className="sheet-actions">
          <button className="btn secondary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
