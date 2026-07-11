// 伺服器端 AI provider 實作（只能在 API route 使用，勿在前端 import）
import Anthropic from '@anthropic-ai/sdk';
import type { AnalyzeResult } from './types';
import {
  buildOpenAICompatibleBody,
  JSON_INSTRUCTION,
  lenientParse,
  normalize,
  SCHEMA,
  SYSTEM_PROMPT,
  USER_TEXT,
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

async function analyzeAnthropic(img: ImageInput): Promise<AnalyzeResult> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> },
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
            { type: 'text', text: USER_TEXT },
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
  opts: { baseUrl: string; apiKey: string | undefined; model: string; strictSchema: boolean; label: string },
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

async function analyzeGemini(img: ImageInput): Promise<AnalyzeResult> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${JSON_INSTRUCTION}` }] },
      contents: [
        {
          role: 'user',
          parts: [{ inline_data: { mime_type: img.mediaType, data: img.base64 } }, { text: USER_TEXT }],
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

export async function analyzeImage(provider: ProviderId, img: ImageInput): Promise<AnalyzeResult> {
  switch (provider) {
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) throw new ProviderError('伺服器未設定 ANTHROPIC_API_KEY。', 500);
      return analyzeAnthropic(img);
    case 'gpt':
      if (!process.env.OPENAI_API_KEY) throw new ProviderError('伺服器未設定 OPENAI_API_KEY。', 500);
      return analyzeOpenAICompatible(img, {
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        strictSchema: true,
        label: 'OpenAI',
      });
    case 'gemini':
      if (!process.env.GEMINI_API_KEY) throw new ProviderError('伺服器未設定 GEMINI_API_KEY。', 500);
      return analyzeGemini(img);
    case 'custom':
      if (!process.env.CUSTOM_BASE_URL) throw new ProviderError('伺服器未設定 CUSTOM_BASE_URL。', 500);
      // 本機/自架模型（如 Gemma）常不支援 response_format，改用 prompt 要求 JSON + 容錯解析
      return analyzeOpenAICompatible(img, {
        baseUrl: process.env.CUSTOM_BASE_URL,
        apiKey: process.env.CUSTOM_API_KEY,
        model: process.env.CUSTOM_MODEL || 'gemma-3-27b-it',
        strictSchema: false,
        label: '自訂模型',
      });
  }
}
