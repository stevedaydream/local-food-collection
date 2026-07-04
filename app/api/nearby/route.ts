import { NextResponse } from 'next/server';
import type { NearbyPlace } from '@/lib/types';

export const maxDuration = 15;

const RADIUS_DEFAULT = 1500; // 公尺

/**
 * 座標 → 附近餐廳清單（隨機推薦「附近」模式用）。
 * 設定 GOOGLE_MAPS_API_KEY 時走 Google Places Nearby Search（結果最準、含評分）；
 * 未設定則退回 OpenStreetMap Overpass（免 key，小店涵蓋率較差）。
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = parseFloat(sp.get('lat') ?? '');
  const lng = parseFloat(sp.get('lng') ?? '');
  const radius = Math.min(parseInt(sp.get('radius') ?? `${RADIUS_DEFAULT}`, 10) || RADIUS_DEFAULT, 5000);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: 'missing lat/lng' }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  try {
    if (key) {
      const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.location,places.rating,places.primaryTypeDisplayName',
        },
        body: JSON.stringify({
          includedTypes: ['restaurant'],
          maxResultCount: 20,
          languageCode: 'zh-TW',
          locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
        }),
      });
      if (!res.ok) return NextResponse.json({ places: [], source: 'google' });
      const data = (await res.json()) as {
        places?: Array<{
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          rating?: number;
          primaryTypeDisplayName?: { text?: string };
        }>;
      };
      const places: NearbyPlace[] = (data.places ?? [])
        .filter((p) => p.displayName?.text)
        .map((p) => ({
          name: p.displayName!.text!,
          address: p.formattedAddress ?? null,
          lat: p.location?.latitude ?? null,
          lng: p.location?.longitude ?? null,
          rating: p.rating ?? null,
          cuisine: p.primaryTypeDisplayName?.text ?? null,
        }));
      return NextResponse.json({ places, source: 'google' });
    }

    // Overpass：找附近有名字的餐廳/小吃/咖啡
    const query = `[out:json][timeout:10];node["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:${radius},${lat},${lng});out body 40;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return NextResponse.json({ places: [], source: 'osm' });
    const data = (await res.json()) as {
      elements?: Array<{ lat: number; lon: number; tags?: Record<string, string> }>;
    };
    const places: NearbyPlace[] = (data.elements ?? [])
      .filter((e) => e.tags?.name)
      .slice(0, 20)
      .map((e) => {
        const t = e.tags!;
        const addr = [t['addr:city'], t['addr:street'], t['addr:housenumber']].filter(Boolean).join('');
        return {
          name: t.name,
          address: addr || null,
          lat: e.lat,
          lng: e.lon,
          rating: null,
          cuisine: t.cuisine?.split(';')[0] ?? null,
        };
      });
    return NextResponse.json({ places, source: 'osm' });
  } catch {
    return NextResponse.json({ places: [], source: key ? 'google' : 'osm' });
  }
}
