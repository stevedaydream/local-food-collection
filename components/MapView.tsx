'use client';

import { useEffect, useRef } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { mapsUrl } from '@/lib/store';
import type { Map as LeafletMap } from 'leaflet';

export default function MapView({ restaurants }: { restaurants: SavedRestaurant[] }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import('leaflet')).default;
      // @ts-expect-error css side-effect import 沒有型別
      await import('leaflet/dist/leaflet.css');
      if (disposed || !el.current || mapRef.current) return;

      const map = L.map(el.current).setView([25.033, 121.5654], 12); // 預設台北
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const located = restaurants.filter((r) => r.lat != null && r.lng != null);
      const markers = located.map((r) => {
        const m = L.marker([r.lat!, r.lng!], {
          icon: L.divIcon({
            className: '',
            html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">📍</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 24],
          }),
        }).addTo(map);
        m.bindPopup(
          `<b>${escapeHtml(r.name)}</b><br>${escapeHtml(r.address ?? r.city ?? '')}<br><a href="${mapsUrl(r)}" target="_blank" rel="noreferrer">導航 →</a>`,
        );
        return m;
      });
      if (markers.length) {
        map.fitBounds(L.featureGroup(markers).getBounds().pad(0.25));
      }
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [restaurants]);

  const unlocated = restaurants.filter((r) => r.lat == null || r.lng == null).length;

  return (
    <>
      <div ref={el} className="map-container" />
      {unlocated > 0 && (
        <p className="meta" style={{ padding: '10px 4px' }}>
          有 {unlocated} 家餐廳因缺少地址無法標在地圖上，仍可在列表中查看。
        </p>
      )}
    </>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
