// 伺服器端 AI provider 實作（只能在 API route 使用，勿在前端 import）
import Anthropic from '@anthropic-ai/sdk';
import type { AnalyzeResult } from './types';
import {
  buildOpenAICompatibleBody,
  buildPrompt,
  lenientParse,
  normalize,
  type AnalyzePrompt,
  type NearbyCandidate,
} from './analyze-shared';

export type ProviderId = 'anthropic' | 'gpt' | 'gemini' | 'custom';

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Claude (Anthropic)',
  gpt: 'GPT (OpenAI)',
  gemini: 'Gemini (Google)',
  custom: '自訂 Endpoint（OpenAI 相容）',
};

/** 各 provider 是否已設定（依環境變數判斷），供 UI 顯示可選項 */
export function configuredProviders(): ProviderId[] {
  const list: ProviderId[] = [];
  if (process.env.ANTHROPIC_API_KEY) list.push('anthropic');
  if (process.env.OPENAI_API_KEY) list.push('gpt');
  if (process.env.GEMINI_API_KEY) list.push('gemini');
  if (process.env.CUSTOM_BASE_URL) list.push('custom');
  return list;
}

export function defaultProvider(): ProviderId | null {
  const env = process.env.AI_PROVIDER as ProviderId | undefined;
  const available = configuredProviders();
  if (env && available.includes(env)) return env;
  return available[0] ?? null;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface ImageInput {
  base64: string;
  mediaType: string;
}

// ---------- Anthropic ----------

async function analyzeAnthropic(img: ImageInput, prompt: AnalyzePrompt): Promise<AnalyzeResult> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: prompt.system,
      output_config: {
        format: { type: 'json_schema', schema: prompt.schema as Record<string, unknown> },
      },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: img.base64,
              },
            },
            { type: 'text', text: prompt.userText },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      throw new ProviderError('這張圖片無法分析，請換一張試試。', 422);
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new ProviderError('AI 未回傳結果，請再試一次。', 502);
    return normalize(JSON.parse(textBlock.text));
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new ProviderError('Anthropic API 金鑰無效。', 500);
    if (err instanceof Anthropic.RateLimitError) throw new ProviderError('請求太頻繁，請稍候再試。', 429);
    if (err instanceof Anthropic.APIError) throw new ProviderError(`Claude 服務錯誤（${err.status}）。`, 502);
    throw err;
  }
}

// ---------- OpenAI 相容（GPT 與自訂 endpoint 共用） ----------

async function analyzeOpenAICompatible(
  img: ImageInput,
  opts: {
    baseUrl: string;
    apiKey: string | undefined;
    model: string;
    strictSchema: boolean;
    label: string;
    prompt: AnalyzePrompt;
  },
): Promise<AnalyzeResult> {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify(buildOpenAICompatibleBody(img, opts)),
  });

  if (!res.ok) {
    if (res.status === 401) throw new ProviderError(`${opts.label} API 金鑰無效。`, 500);
    if (res.status === 429) throw new ProviderError('請求太頻繁，請稍候再試。', 429);
    const detail = await res.text().catch(() => '');
    throw new ProviderError(`${opts.label} 服務錯誤（${res.status}）：${detail.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError(`${opts.label} 未回傳結果，請再試一次。`, 502);
  return lenientParse(content);
}

// ---------- Gemini ----------

async function analyzeGemini(img: ImageInput, prompt: AnalyzePrompt): Promise<AnalyzeResult> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${prompt.system}\n\n${prompt.jsonInstruction}` }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: img.mediaType, data: img.base64 } },
            { text: prompt.userText },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new ProviderError('Gemini API 金鑰無效或無權限。', 500);
    if (res.status === 429) throw new ProviderError('請求太頻繁，請稍候再試。', 429);
    const detail = await res.text().catch(() => '');
    throw new ProviderError(`Gemini 服務錯誤（${res.status}）：${detail.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new ProviderError('Gemini 未回傳結果，請再試一次。', 502);
  return lenientParse(text);
}

// ---------- 入口 ----------

/**
 * @param mode screenshot=社群截圖；photo=現場拍的照片（會附上附近店家清單讓模型指認）
 * @param candidates 拍照模式的附近店家清單（依 GPS 查到）
 */
export async function analyzeImage(
  provider: ProviderId,
  img: ImageInput,
  mode: 'screenshot' | 'photo' = 'screenshot',
  candidates: NearbyCandidate[] = [],
): Promise<AnalyzeResult> {
  const prompt = buildPrompt(mode, candidates);
  switch (provider) {
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) throw new ProviderError('伺服器未設定 ANTHROPIC_API_KEY。', 500);
      return analyzeAnthropic(img, prompt);
    case 'gpt':
      if (!process.env.OPENAI_API_KEY) throw new ProviderError('伺服器未設定 OPENAI_API_KEY。', 500);
      return analyzeOpenAICompatible(img, {
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        strictSchema: true,
        label: 'OpenAI',
        prompt,
      });
    case 'gemini':
      if (!process.env.GEMINI_API_KEY) throw new ProviderError('伺服器未設定 GEMINI_API_KEY。', 500);
      return analyzeGemini(img, prompt);
    case 'custom':
      if (!process.env.CUSTOM_BASE_URL) throw new ProviderError('伺服器未設定 CUSTOM_BASE_URL。', 500);
      // 本機/自架模型（如 Gemma）常不支援 response_format，改用 prompt 要求 JSON + 容錯解析
      return analyzeOpenAICompatible(img, {
        baseUrl: process.env.CUSTOM_BASE_URL,
        apiKey: process.env.CUSTOM_API_KEY,
        model: process.env.CUSTOM_MODEL || 'gemma-3-27b-it',
        strictSchema: false,
        label: '自訂模型',
        prompt,
      });
  }
}
