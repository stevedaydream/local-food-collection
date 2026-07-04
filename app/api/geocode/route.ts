import { NextResponse } from 'next/server';

export const maxDuration = 15;

/**
 * 地址轉座標 — 代理 OpenStreetMap Nominatim（免 API key）。
 * 低流量個人使用符合 Nominatim 使用政策；正式產品請換成付費 geocoding 服務。
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'local-food-collection/0.1 (personal food map app)' },
      // Nominatim 結果對同一地址很穩定，快取一天減少請求量
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ lat: null, lng: null });

    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return NextResponse.json({ lat: null, lng: null });

    return NextResponse.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
  } catch {
    return NextResponse.json({ lat: null, lng: null });
  }
}
