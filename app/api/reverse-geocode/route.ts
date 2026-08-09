import { NextResponse } from 'next/server';
import { reverseGeo } from '@/lib/reverse-geo';

export const maxDuration = 15;

/**
 * 座標 → 國家 / 一級行政區 / 二級行政區（代理 OpenStreetMap Nominatim，免 API key）。
 * 用於 header 的「📍 日本 東京都 荒川區」與設定裡的「補齊地區資料」。
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = parseFloat(sp.get('lat') ?? '');
  const lng = parseFloat(sp.get('lng') ?? '');
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'missing lat/lng' }, { status: 400 });
  }
  return NextResponse.json(await reverseGeo(lat, lng));
}
