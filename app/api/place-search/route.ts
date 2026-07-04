import { NextResponse } from 'next/server';

export const maxDuration = 15;

/**
 * 店名 → 店家正式地址 + 座標（給編輯表單「帶入地址」按鈕用）。
 * 設定 GOOGLE_MAPS_API_KEY 時走 Google Places Text Search（結果最準）；
 * 未設定則退回 OpenStreetMap Nominatim（免 key，小店可能查不到）。
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });

  const empty = { name: null, address: null, lat: null, lng: null };
  const key = process.env.GOOGLE_MAPS_API_KEY;

  try {
    if (key) {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify({ textQuery: q, languageCode: 'zh-TW' }),
      });
      if (!res.ok) return NextResponse.json({ ...empty, source: 'google' });
      const data = (await res.json()) as {
        places?: Array<{
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
        }>;
      };
      const p = data.places?.[0];
      if (!p) return NextResponse.json({ ...empty, source: 'google' });
      return NextResponse.json({
        name: p.displayName?.text ?? null,
        address: p.formattedAddress ?? null,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        source: 'google',
      });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'local-food-collection/0.1 (personal food map app)' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ ...empty, source: 'osm' });
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return NextResponse.json({ ...empty, source: 'osm' });
    return NextResponse.json({
      name: null,
      address: data[0].display_name,
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      source: 'osm',
    });
  } catch {
    return NextResponse.json(empty);
  }
}
