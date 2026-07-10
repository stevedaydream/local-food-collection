// 前後端共用的分析 prompt / schema / 解析工具（不可 import 任何伺服器端 SDK）
import type { AnalyzeResult } from './types';

export const SYSTEM_PROMPT = `你是美食截圖分析助手。使用者會傳來社群媒體（Instagram、Threads、小紅書、Facebook 等）的餐廳/美食貼文截圖。

你的任務：從截圖中辨識出所有餐廳，抽出結構化資訊。

規則：
- 店名以截圖中實際出現的文字為準，不要猜測或補全你不確定的店名。
- 地址只在截圖中明確出現時才填寫；看不到地址就填 null，不要編造。
- 一張截圖可能包含多家餐廳（例如清單型貼文），全部列出。
- 若截圖與美食無關，is_food_content 設為 false、restaurants 為空陣列。
- 所有文字欄位使用繁體中文（店名保留原文）。`;

/** 給不支援 structured output 的模型（Gemini JSON mode、本機模型）用的 JSON 格式說明 */
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

export const USER_TEXT = '請分析這張截圖，抽出所有餐廳資訊。';

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

/** 容錯 JSON 解析：去除 code fence、擷取最外層物件 */
export function lenientParse(text: string): AnalyzeResult {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no json object in response');
  return normalize(JSON.parse(t.slice(start, end + 1)));
}

/** 補齊缺漏欄位，避免模型少給欄位時前端壞掉 */
export function normalize(raw: unknown): AnalyzeResult {
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

/** OpenAI 相容 chat/completions 請求 body（本機模式與伺服器端共用） */
export function buildOpenAICompatibleBody(
  img: { base64: string; mediaType: string },
  opts: { model: string; strictSchema: boolean },
): Record<string, unknown> {
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
  return body;
}
