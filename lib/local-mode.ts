// 本機模式：瀏覽器直接連使用者裝置上的 OpenAI 相容模型伺服器（Ollama / llama.cpp / LM Studio…）
// 截圖完全不離開使用者的裝置/區網。
import type { AnalyzeResult } from './types';
import { buildOpenAICompatibleBody, lenientParse } from './analyze-shared';

export interface LocalConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const KEY = 'food-map:local-config';

export function getLocalConfig(): LocalConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as LocalConfig;
    return cfg.baseUrl && cfg.model ? cfg : null;
  } catch {
    return null;
  }
}

export function setLocalConfig(cfg: LocalConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

/**
 * HTTPS 頁面只能直連 localhost（安全情境豁免）；
 * 連 http://192.168.x.x 這種區網位址會被瀏覽器的混合內容政策擋下。
 */
export function mixedContentBlocked(baseUrl: string): boolean {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') return false;
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

function headers(cfg: LocalConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
  };
}

/** 測試連線：打 GET /models，並回報伺服器上有哪些模型 */
export async function testLocalConnection(
  cfg: LocalConfig,
): Promise<{ ok: boolean; message: string; models: string[] }> {
  if (mixedContentBlocked(cfg.baseUrl)) {
    return {
      ok: false,
      models: [],
      message:
        '瀏覽器擋住了 HTTPS 頁面連往 http:// 區網位址（混合內容）。請改用 localhost（模型跑在同一台裝置上），或用 Tailscale / ngrok 給模型伺服器一個 https:// 網址。',
    };
  }
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/models`, { headers: headers(cfg) });
    if (!res.ok) {
      return { ok: false, models: [], message: `伺服器回應 ${res.status}，請確認 URL 是否正確（要含 /v1）。` };
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((m) => m.id ?? '').filter(Boolean);
    const hasModel = models.includes(cfg.model);
    return {
      ok: true,
      models,
      message: hasModel
        ? `連線成功，找到模型「${cfg.model}」！`
        : models.length
          ? `連線成功！但伺服器上沒有「${cfg.model}」，可用：${models.slice(0, 5).join('、')}`
          : '連線成功！（伺服器未回報模型清單，直接測試分析看看）',
    };
  } catch {
    return {
      ok: false,
      models: [],
      message: '連不上伺服器。請確認：1) 模型伺服器已啟動 2) URL 正確 3) 伺服器已允許 CORS（見教學）。',
    };
  }
}

/** 在瀏覽器端直接呼叫本機模型分析截圖 */
export async function analyzeLocal(
  cfg: LocalConfig,
  img: { base64: string; mediaType: string },
): Promise<AnalyzeResult> {
  if (mixedContentBlocked(cfg.baseUrl)) {
    throw new Error('瀏覽器擋住了連往 http:// 區網位址的請求，請到 ⚙️ 設定查看本機模式教學。');
  }
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: headers(cfg),
      // 本機模型普遍不支援 response_format，改用 prompt 要求 JSON
      body: JSON.stringify(buildOpenAICompatibleBody(img, { model: cfg.model, strictSchema: false })),
    });
  } catch {
    throw new Error('連不上本機模型伺服器，請確認伺服器已啟動、CORS 已開啟（⚙️ 設定 → 本機模式教學）。');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`本機模型錯誤（${res.status}）：${detail.slice(0, 150)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('本機模型沒有回傳內容，請確認模型支援圖片輸入（vision）。');
  try {
    return lenientParse(content);
  } catch {
    throw new Error('本機模型的回覆不是有效 JSON。建議換一個支援 vision 且指令跟隨較好的模型。');
  }
}
