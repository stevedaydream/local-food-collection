import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

const SCHEMA = {
  type: 'object',
  properties: {
    is_food_content: {
      type: 'boolean',
      description: '截圖內容是否與餐廳/美食相關',
    },
    restaurants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '餐廳或店家名稱' },
          address: {
            type: ['string', 'null'],
            description: '完整地址（若截圖中有）；沒有則為 null',
          },
          city: { type: ['string', 'null'], description: '城市或地區，例如「台北 大安區」' },
          cuisine: {
            type: ['string', 'null'],
            description: '料理類型，例如：日式、火鍋、咖啡廳、甜點',
          },
          dishes: {
            type: 'array',
            items: { type: 'string' },
            description: '截圖中提到或出現的推薦菜色',
          },
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
        required: [
          'name',
          'address',
          'city',
          'cuisine',
          'dishes',
          'price_range',
          'source_platform',
          'notes',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['is_food_content', 'restaurants'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `你是美食截圖分析助手。使用者會傳來社群媒體（Instagram、Threads、小紅書、Facebook 等）的餐廳/美食貼文截圖。

你的任務：從截圖中辨識出所有餐廳，抽出結構化資訊。

規則：
- 店名以截圖中實際出現的文字為準，不要猜測或補全你不確定的店名。
- 地址只在截圖中明確出現時才填寫；看不到地址就填 null，不要編造。
- 一張截圖可能包含多家餐廳（例如清單型貼文），全部列出。
- 若截圖與美食無關，is_food_content 設為 false、restaurants 為空陣列。
- 所有文字欄位使用繁體中文（店名保留原文）。`;

type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: '伺服器尚未設定 ANTHROPIC_API_KEY，請參考 README 設定後再試。' },
      { status: 500 },
    );
  }

  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const { image, mediaType } = body;
  if (!image || !mediaType) {
    return NextResponse.json({ error: '缺少 image 或 mediaType' }, { status: 400 });
  }
  const allowed: MediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(mediaType as MediaType)) {
    return NextResponse.json({ error: `不支援的圖片格式：${mediaType}` }, { status: 400 });
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
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
              source: { type: 'base64', media_type: mediaType as MediaType, data: image },
            },
            { type: 'text', text: '請分析這張截圖，抽出所有餐廳資訊。' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: '這張圖片無法分析，請換一張試試。' }, { status: 422 });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'AI 未回傳結果，請再試一次。' }, { status: 502 });
    }

    return NextResponse.json(JSON.parse(textBlock.text));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'API 金鑰無效，請檢查 ANTHROPIC_API_KEY。' }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: '請求太頻繁，請稍候再試。' }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI 服務錯誤（${err.status}），請稍後再試。` }, { status: 502 });
    }
    return NextResponse.json({ error: '分析失敗，請再試一次。' }, { status: 500 });
  }
}
