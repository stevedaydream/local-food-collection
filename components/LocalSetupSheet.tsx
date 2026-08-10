'use client';

import { useState } from 'react';
import {
  getLocalConfig,
  mixedContentBlocked,
  setLocalConfig,
  testLocalConnection,
  type LocalConfig,
} from '@/lib/local-mode';

/** 常見本機模型伺服器的一鍵範本 */
const PRESETS = [
  {
    id: 'ollama',
    name: 'Ollama（電腦，最簡單）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'gemma3:12b',
    steps: [
      '到 ollama.com 下載安裝 Ollama',
      '終端機執行：ollama pull gemma3:12b（需要 vision 能力的模型）',
      '允許瀏覽器連線（CORS）後啟動：',
      'macOS/Linux：OLLAMA_ORIGINS="*" ollama serve',
      'Windows PowerShell：$env:OLLAMA_ORIGINS="*"; ollama serve',
    ],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（電腦，圖形介面）',
    baseUrl: 'http://localhost:1234/v1',
    model: 'google/gemma-3-12b',
    steps: [
      '到 lmstudio.ai 下載安裝，搜尋並下載一個 vision 模型（如 Gemma 3）',
      '左側「Developer」→ Start Server',
      '在 Server 設定中開啟「Enable CORS」',
    ],
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp（進階）',
    baseUrl: 'http://localhost:8080/v1',
    model: 'gemma-3-12b-it',
    steps: [
      '下載 vision 模型的 GGUF 與對應 mmproj 檔',
      '啟動：llama-server -m model.gguf --mmproj mmproj.gguf --port 8080',
      'llama-server 預設允許 CORS，不用額外設定',
    ],
  },
  {
    id: 'android',
    name: 'Android 手機（Termux + Ollama）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'gemma3:4b',
    steps: [
      '安裝 Termux（F-Droid 版），執行：pkg install ollama',
      'ollama pull gemma3:4b（手機建議小模型）',
      'OLLAMA_ORIGINS="*" ollama serve',
      '直接在「同一支手機」的瀏覽器用本 App 即可（localhost 直連）',
    ],
  },
];

export default function LocalSetupSheet({ onDone }: { onDone: (configured: boolean) => void }) {
  const existing = getLocalConfig();
  const [preset, setPreset] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setPreset(preset === p.id ? null : p.id);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setTestResult(null);
  };

  const cfg: LocalConfig = { baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() };
  const canTest = cfg.baseUrl && cfg.model;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestResult(await testLocalConnection(cfg));
    setTesting(false);
  };

  const handleSave = () => {
    setLocalConfig(cfg);
    onDone(true);
  };

  return (
    <div className="overlay" onClick={() => onDone(!!getLocalConfig())}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>📱 本機模式設置</h2>
        <p className="meta" style={{ marginBottom: 14 }}>
          瀏覽器直接連你裝置上的模型（如 Gemma），截圖完全不上傳到雲端。
          需要一個 OpenAI 相容的模型伺服器，照下面三步驟設置：
        </p>

        <p style={{ fontSize: 14, fontWeight: 700, margin: '10px 0 6px' }}>
          第 1 步：啟動模型伺服器（點選你的環境看教學）
        </p>
        <div className="chips" style={{ marginBottom: 8 }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`chip ${preset === p.id ? 'accent' : ''}`}
              onClick={() => applyPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
        {preset && (
          <ol
            className="meta"
            style={{
              background: 'var(--surface-2)',
              borderRadius: 10,
              padding: '10px 12px 10px 30px',
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            {PRESETS.find((p) => p.id === preset)!.steps.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {s.includes('：') || s.includes(':') ? (
                  <span style={{ overflowWrap: 'anywhere' }}>{s}</span>
                ) : (
                  s
                )}
              </li>
            ))}
          </ol>
        )}

        <p style={{ fontSize: 14, fontWeight: 700, margin: '10px 0 6px' }}>第 2 步：填入連線資訊</p>
        <div className="field">
          <label>伺服器 URL（含 /v1）</label>
          <input
            value={baseUrl}
            placeholder="http://localhost:11434/v1"
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setTestResult(null);
            }}
          />
        </div>
        {baseUrl && mixedContentBlocked(baseUrl) && (
          <p className="error-text" style={{ fontSize: 12.5 }}>
            ⚠️ 本站是 HTTPS，瀏覽器只允許直連 localhost。要連區網其他機器（http://192.168…），
            請用 Tailscale（tailscale serve）或 ngrok 給它一個 https:// 網址。
          </p>
        )}
        <div className="field">
          <label>模型名稱（需支援圖片/vision）</label>
          <input
            value={model}
            placeholder="gemma3:12b"
            onChange={(e) => {
              setModel(e.target.value);
              setTestResult(null);
            }}
          />
        </div>
        <div className="field">
          <label>API Key（大多數本機伺服器不需要，留空即可）</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>

        <p style={{ fontSize: 14, fontWeight: 700, margin: '10px 0 6px' }}>第 3 步：測試連線</p>
        <button className="btn secondary" onClick={handleTest} disabled={!canTest || testing}>
          {testing ? <span className="spinner" /> : '🔌 測試連線'}
        </button>
        {testResult && (
          <p
            className={testResult.ok ? 'meta' : 'error-text'}
            style={{ marginTop: 8, fontSize: 13, color: testResult.ok ? 'var(--bamboo)' : undefined }}
          >
            {testResult.ok ? '✅ ' : ''}
            {testResult.message}
          </p>
        )}

        <div className="sheet-actions">
          <button className="btn secondary" onClick={() => onDone(!!getLocalConfig())}>
            取消
          </button>
          <button className="btn primary" onClick={handleSave} disabled={!canTest}>
            💾 儲存並啟用
          </button>
        </div>
      </div>
    </div>
  );
}
