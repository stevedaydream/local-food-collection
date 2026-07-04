import { NextResponse } from 'next/server';
import { configuredProviders, defaultProvider, PROVIDER_LABELS } from '@/lib/ai-providers';

export const dynamic = 'force-dynamic';

/** 回傳伺服器已設定的 AI provider 清單，供設定畫面顯示可選項 */
export async function GET() {
  const available = configuredProviders();
  return NextResponse.json({
    available: available.map((id) => ({ id, label: PROVIDER_LABELS[id] })),
    default: defaultProvider(),
  });
}
