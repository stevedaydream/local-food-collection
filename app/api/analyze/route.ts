import { NextResponse } from 'next/server';
import {
  analyzeImage,
  configuredProviders,
  defaultProvider,
  ProviderError,
  type ProviderId,
} from '@/lib/ai-providers';

export const maxDuration = 60;

const VALID: ProviderId[] = ['anthropic', 'gpt', 'gemini', 'custom'];
const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(req: Request) {
  let body: {
    image?: string;
    mediaType?: string;
    provider?: string;
    /** photo = 現場拍的照片，會附上附近店家清單讓模型指認 */
    mode?: 'screenshot' | 'photo';
    candidates?: Array<{ name?: string; address?: string | null }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const { image, mediaType } = body;
  if (!image || !mediaType) {
    return NextResponse.json({ error: '缺少 image 或 mediaType' }, { status: 400 });
  }
  if (!ALLOWED_MEDIA.includes(mediaType)) {
    return NextResponse.json({ error: `不支援的圖片格式：${mediaType}` }, { status: 400 });
  }

  // 決定 provider：請求指定且已設定 → 用它；否則用伺服器預設
  const available = configuredProviders();
  if (available.length === 0) {
    return NextResponse.json(
      { error: '伺服器尚未設定任何 AI provider，請至少設定一組 API 金鑰（見 README）。' },
      { status: 500 },
    );
  }
  let provider = defaultProvider()!;
  if (body.provider && VALID.includes(body.provider as ProviderId)) {
    if (!available.includes(body.provider as ProviderId)) {
      return NextResponse.json(
        { error: `伺服器尚未設定「${body.provider}」的金鑰，可用：${available.join('、')}` },
        { status: 400 },
      );
    }
    provider = body.provider as ProviderId;
  }

  const mode = body.mode === 'photo' ? 'photo' : 'screenshot';
  // 清單只取模型需要的欄位，且限制筆數避免 prompt 過長
  const candidates = (body.candidates ?? [])
    .filter((c) => c.name)
    .slice(0, 20)
    .map((c) => ({ name: String(c.name), address: c.address ? String(c.address) : null }));

  try {
    const result = await analyzeImage(provider, { base64: image, mediaType }, mode, candidates);
    return NextResponse.json({ ...result, provider });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: '分析失敗，請再試一次。' }, { status: 500 });
  }
}
