// 前後端共用的分析 prompt / schema / 解析工具（不可 import 任何伺服器端 SDK）
import type { AnalyzeResult } from './types';
import { splitCityDistrict } from './place-url';

export const SYSTEM_PROMPT = `你是美食截圖分析助手。使用者會傳來社群媒體（Instagram、Threads、小紅書、Facebook 等）的餐廳/美食貼文截圖。

你的任務：從截圖中辨識出所有餐廳，抽出結構化資訊。

規則：
- 店名以截圖中實際出現的文字為準，不要猜測或補全你不確定的店名。
- 地址只在截圖中明確出現時才填寫；看不到地址就填 null，不要編造。
- 一張截圖可能包含多家餐廳（例如清單型貼文），全部列出。
- 若截圖與美食無關，is_food_content 設為 false、restaurants 為空陣列。
- 地區分兩層填：city 只填一級行政區（台北市、東京都），district 填二級（信義區、荒川區）；不要把兩層寫在同一欄。
- 所有文字欄位使用繁體中文（店名保留原文）。`;

/** 給不支援 structured output 的模型（Gemini JSON mode、本機模型）用的 JSON 格式說明 */
export const JSON_INSTRUCTION = `請只輸出一個 JSON 物件（不要 markdown code fence、不要其他文字），格式如下：
{
  "is_food_content": boolean,
  "restaurants": [
    {
      "name": "店名",
      "address": "完整地址，截圖沒有就用 null",
      "city": "一級行政區，如「台北市」「東京都」，不確定用 null",
      "district": "二級行政區，如「信義區」「荒川區」，不確定用 null",
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

/** 拍照模式（實景照：招牌、門面、菜單）的 system prompt */
export const PHOTO_SYSTEM_PROMPT = `你是美食拍照記錄助手。使用者會傳來「現場拍的照片」——通常是店家招牌或門面，也可能是菜單、價目表。

你的任務：辨識這是哪一家店，抽出結構化資訊。

規則：
- 店名以招牌/門面上實際出現的文字為準（保留原文，例如日文店名就填日文），不要翻譯、不要猜測。
- 使用者會附上「附近店家清單」（依 GPS 定位查到的）。請比對照片上的店名與清單，選出最可能的一家，把它的編號填進 nearby_index；招牌是簡稱或清單裡是正式名稱時也要盡量對上。
- 完全對不上就把 nearby_index 設為 null，仍然照招牌文字填 name。
- 另外把其他也有可能的候選編號（最多 3 個，依可能性排序）填進 alternate_indexes。
- 照片裡看得到菜單、價目、營業時間就一併抽進 dishes / price_range / notes。
- 地址只在照片中明確出現時才填；看不到就填 null（程式會用清單裡的地址補）。
- 如果這其實是社群媒體貼文的截圖（不是實景照），就照截圖規則抽出所有餐廳，nearby_index 填 null。
- 一張照片通常只有一家店；真的有多家（例如整排招牌）才列多筆。
- 所有描述性文字使用繁體中文（店名保留原文）。`;

export interface NearbyCandidate {
  name: string;
  address: string | null;
}

/** 把附近店家清單編號後附在使用者訊息裡，讓模型可以用 nearby_index 指認 */
export function buildPhotoUserText(candidates: NearbyCandidate[]): string {
  if (!candidates.length) {
    return '請辨識這張照片裡的店家。（這次沒有查到附近店家清單，nearby_index 請填 null）';
  }
  const list = candidates
    .map((c, i) => `[${i}] ${c.name}${c.address ? `（${c.address}）` : ''}`)
    .join('\n');
  return `請辨識這張照片裡的店家，並比對下面依定位查到的附近店家清單：\n${list}\n\n選出最可能的一家填 nearby_index（對不上填 null），其他可能的填 alternate_indexes。`;
}

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
          city: { type: ['string', 'null'], description: '一級行政區，例如「台北市」「東京都」' },
          district: { type: ['string', 'null'], description: '二級行政區，例如「信義區」「荒川區」' },
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
        required: ['name', 'address', 'city', 'district', 'cuisine', 'dishes', 'price_range', 'source_platform', 'notes', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['is_food_content', 'restaurants'],
  additionalProperties: false,
} as const;

/** 拍照模式的 schema：多了「對應到附近清單第幾家」的欄位 */
export const PHOTO_SCHEMA = {
  ...SCHEMA,
  properties: {
    ...SCHEMA.properties,
    restaurants: {
      ...SCHEMA.properties.restaurants,
      items: {
        ...SCHEMA.properties.restaurants.items,
        properties: {
          ...SCHEMA.properties.restaurants.items.properties,
          nearby_index: {
            type: ['integer', 'null'],
            description: '對應到附近店家清單的編號；對不上填 null',
          },
          alternate_indexes: {
            type: 'array',
            items: { type: 'integer' },
            description: '其他也可能的候選編號，依可能性排序，最多 3 個',
          },
        },
        required: [
          ...SCHEMA.properties.restaurants.items.required,
          'nearby_index',
          'alternate_indexes',
        ],
      },
    },
  },
} as const;

/** 拍照模式的 JSON 格式說明（給不支援 structured output 的模型） */
export const PHOTO_JSON_INSTRUCTION = JSON_INSTRUCTION.replace(
  '"confidence": "high | medium | low"',
  '"confidence": "high | medium | low",\n      "nearby_index": 對應附近清單的編號或 null,\n      "alternate_indexes": [其他可能的編號]',
);

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

/**
 * 模型還是可能把兩層寫在 city（舊 prompt 的習慣），這裡統一拆開；
 * 已經分開給的就直接用。
 */
function splitRegion(city: unknown, district: unknown) {
  const rawCity = city ? String(city) : null;
  const rawDistrict = district ? String(district) : null;
  if (rawDistrict) return { city: rawCity, district: rawDistrict };
  return splitCityDistrict(rawCity);
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
        ...splitRegion(r.city, r.district),
        cuisine: r.cuisine ? String(r.cuisine) : null,
        dishes: Array.isArray(r.dishes) ? r.dishes.map(String) : [],
        price_range: r.price_range ? String(r.price_range) : null,
        source_platform: r.source_platform ? String(r.source_platform) : null,
        notes: r.notes ? String(r.notes) : null,
        confidence: (r.confidence === 'high' || r.confidence === 'low' ? r.confidence : 'medium') as
          | 'high'
          | 'medium'
          | 'low',
        // 拍照模式才有：對應到附近店家清單第幾家
        nearby_index: Number.isInteger(r.nearby_index) ? (r.nearby_index as number) : null,
        alternate_indexes: Array.isArray(r.alternate_indexes)
          ? r.alternate_indexes.filter((n): n is number => Number.isInteger(n)).slice(0, 3)
          : [],
      }))
      .filter((r) => r.name),
  };
}

/** 一次分析要用的 prompt 組合（截圖模式或拍照模式） */
export interface AnalyzePrompt {
  system: string;
  userText: string;
  jsonInstruction: string;
  schema: unknown;
}

/**
 * 依模式組出 prompt。
 * 拍照模式會把附近店家清單編號後附進使用者訊息，讓模型指認是哪一家。
 */
export function buildPrompt(
  mode: 'screenshot' | 'photo',
  candidates: NearbyCandidate[] = [],
): AnalyzePrompt {
  if (mode === 'photo') {
    return {
      system: PHOTO_SYSTEM_PROMPT,
      userText: buildPhotoUserText(candidates),
      jsonInstruction: PHOTO_JSON_INSTRUCTION,
      schema: PHOTO_SCHEMA,
    };
  }
  return {
    system: SYSTEM_PROMPT,
    userText: USER_TEXT,
    jsonInstruction: JSON_INSTRUCTION,
    schema: SCHEMA,
  };
}

/** OpenAI 相容 chat/completions 請求 body（本機模式與伺服器端共用） */
export function buildOpenAICompatibleBody(
  img: { base64: string; mediaType: string },
  opts: { model: string; strictSchema: boolean; prompt?: AnalyzePrompt },
): Record<string, unknown> {
  const prompt = opts.prompt ?? buildPrompt('screenshot');
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      {
        role: 'system',
        content: prompt.system + (opts.strictSchema ? '' : `\n\n${prompt.jsonInstruction}`),
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } },
          { type: 'text', text: prompt.userText },
        ],
      },
    ],
  };
  if (opts.strictSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'analyze_result', strict: true, schema: prompt.schema },
    };
  }
  return body;
}
