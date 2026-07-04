import Anthropic from '@anthropic-ai/sdk';
import type { AnalyzeResult } from './types';

export type ProviderId = 'anthropic' | 'gpt' | 'gemini' | 'custom';

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Claude (Anthropic)',
  gpt: 'GPT (OpenAI)',
  gemini: 'Gemini (Google)',
  custom: '自訂 Endpoint（OpenAI 相容，如本機 Gemma）',
};

export const SYSTEM_PROMPT = `你是美食截圖分析助手。使用者會傳來社群媒體（Instagram、Threads、小紅書、Facebook 等）的餐廳/美食貼文截圖。

你的任務：從截圖中辨識出所有餐廳，抽出結構化資訊。

規則：
- 店名以截圖中實際出現的文字為準，不要猜測或補全你不確定的店名。
- 地址只在截圖中明確出現時才填寫；看不到地址就填 null，不要編造。
- 一張截圖可能包含多家餐廳（例如清單型貼文），全部列出。
- 若截圖與美食無關，is_food_content 設為 false、restaurants 為空陣列。
- 所有文字欄位使用繁體中文（店名保留原文）。`;

/** 給不支援 structured output 的 provider（Gemini、自訂 endpoint）用的 JSON 格式說明 */
export const JSON_INSTRUCTION = `請只輸出一個 JSON 物件（不要 markdown code fence、不要其他文字），格式如下：
{
  "is_food_content": boolean,
  "restaurants": [
    {
      "name": "店名",
      "address": "完整地址，截圖沒有就用 null",
      "city": "城市或地區，如「台北 大安區」，不確定用 null",
      "cuisine": "料理類型（日式/火鍋/咖啡廳…），不確定用 null",
      "dishes": ["推薦菜色"],
      "price_range": "價位（若有），否則 null",
      "source_platform": "截圖來源平台（Instagram/Threads/小紅書…），不確定用 null",
      "notes": "營業時間、要預約、排隊等重點，沒有就 null",
      "confidence": "high | medium | low"
    }
  ]
}`;

export const SCHEMA = {
  type: 'object',
  properties: {
    is_food_content: { type: 'boolean', description: '截圖內容是否與餐廳/美食相關' },
    restaurants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '餐廳或店家名稱' },
          address: { type: ['string', 'null'], description: '完整地址（若截圖中有）；沒有則為 null' },
          city: { type: ['string', 'null'], description: '城市或地區，例如「台北 大安區」' },
          cuisine: { type: ['string', 'null'], description: '料理類型，例如：日式、火鍋、咖啡廳、甜點' },
          dishes: { type: 'array', items: { type: 'string' }, description: '截圖中提到或出現的推薦菜色' },
          price_range: { type: ['string', 'null'], description: '價位資訊（若有），例如 $200-400/人' },
          source_platform: {
            type: ['string', 'null'],
            description: '截圖來源平台，例如：Instagram、Threads、小紅書、Facebook、Google Maps、YouTube',
          },
          notes: {
            type: ['string', 'null'],
            description: '其他值得記下的重點：營業時間、要預約、排隊、季節限定等',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: '對店名與地址判讀的信心程度',
          },
        },
        required: ['name', 'address', 'city', 'cuisine', 'dishes', 'price_range', 'source_platform', 'notes', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['is_food_content', 'restaurants'],
  additionalProperties: false,
} as const;

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

/** 容錯 JSON 解析：去除 code fence、擷取最外層物件 */
function lenientParse(text: string): AnalyzeResult {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no json object in response');
  return normalize(JSON.parse(t.slice(start, end + 1)));
}

/** 補齊缺漏欄位，避免 provider 少給欄位時前端壞掉 */
function normalize(raw: unknown): AnalyzeResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const restaurants = Array.isArray(obj.restaurants) ? obj.restaurants : [];
  return {
    is_food_content: Boolean(obj.is_food_content) && restaurants.length >= 0,
    restaurants: restaurants
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({
        name: String(r.name ?? '').trim(),
        address: r.address ? String(r.address) : null,
        city: r.city ? String(r.city) : null,
        cuisine: r.cuisine ? String(r.cuisine) : null,
        dishes: Array.isArray(r.dishes) ? r.dishes.map(String) : [],
        price_range: r.price_range ? String(r.price_range) : null,
        source_platform: r.source_platform ? String(r.source_platform) : null,
        notes: r.notes ? String(r.notes) : null,
        confidence: (r.confidence === 'high' || r.confidence === 'low' ? r.confidence : 'medium') as
          | 'high'
          | 'medium'
          | 'low',
      }))
      .filter((r) => r.name),
  };
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

const USER_TEXT = '請分析這張截圖，抽出所有餐廳資訊。';

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
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + (opts.strictSchema ? '' : `\n\n${JSON_INSTRUCTION}`) },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
          { type: 'text', text: USER_TEXT },
        ],
      },
    ],
  };
  if (opts.strictSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'analyze_result', strict: true, schema: SCHEMA },
    };
  }

  const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
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
          parts: [
            { inline_data: { mime_type: img.mediaType, data: img.base64 } },
            { text: USER_TEXT },
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
