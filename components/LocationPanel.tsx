'use client';

import { useMemo, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { countryOf } from '@/lib/country-bbox';
import {
  clearManualLocation,
  locationLabel,
  setManualLocation,
  type DeviceLocation,
} from '@/lib/location';

/** 收藏過的地區選項：國家 + 一級行政區 + 該組收藏的中位座標 */
interface RegionOption {
  key: string;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  count: number;
  lat: number;
  lng: number;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * 點 header 的「📍 …」開出來的小面板：看目前判定、重新定位、手動指定、回自動。
 * 手動指定一定會帶座標（附近搜尋與距離排序都需要），所以只提供
 * 「收藏過的地區（用該組收藏的中位座標）」與「輸入地名（走地理編碼）」兩種來源。
 */
export default function LocationPanel({
  restaurants,
  location,
  stale,
  onApply,
  onRefresh,
  onClose,
}: {
  restaurants: SavedRestaurant[];
  location: DeviceLocation | null;
  stale: boolean;
  onApply: (loc: DeviceLocation) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const options = useMemo<RegionOption[]>(() => {
    const groups = new Map<string, { lats: number[]; lngs: number[]; opt: Omit<RegionOption, 'count' | 'lat' | 'lng'> }>();
    for (const r of restaurants) {
      if (r.lat == null || r.lng == null) continue;
      const hit = countryOf(r.lat, r.lng);
      const countryCode = r.countryCode ?? hit?.code ?? null;
      if (!countryCode) continue;
      const country = r.country ?? hit?.name ?? null;
      const key = `${countryCode}|${r.city ?? ''}`;
      const g = groups.get(key) ?? { lats: [], lngs: [], opt: { key, country, countryCode, city: r.city ?? null } };
      g.lats.push(r.lat);
      g.lngs.push(r.lng);
      groups.set(key, g);
    }
    return Array.from(groups.values())
      .map(({ lats, lngs, opt }) => ({
        ...opt,
        count: lats.length,
        lat: median(lats),
        lng: median(lngs),
      }))
      .sort((a, b) => b.count - a.count);
  }, [restaurants]);

  function applyOption(o: RegionOption) {
    onApply(
      setManualLocation({
        lat: o.lat,
        lng: o.lng,
        country: o.country,
        countryCode: o.countryCode,
        city: o.city,
        district: null,
      }),
    );
    onClose();
  }

  /** 自由輸入地名 → 地理編碼取座標 → 反查行政區 */
  async function applyQuery() {
    const q = query.trim();
    if (!q || busy) return;
    setBusy('search');
    setError('');
    try {
      const geo = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json());
      if (geo.lat == null || geo.lng == null) {
        setError('找不到這個地名，試著加上國家或城市（例如「東京 新宿站」）');
        setBusy('');
        return;
      }
      const region = await fetch(`/api/reverse-geocode?lat=${geo.lat}&lng=${geo.lng}`).then((r) => r.json());
      const hit = countryOf(geo.lat, geo.lng);
      onApply(
        setManualLocation({
          lat: geo.lat,
          lng: geo.lng,
          country: region.country ?? hit?.name ?? null,
          countryCode: region.countryCode ?? hit?.code ?? null,
          city: region.city ?? null,
          district: region.district ?? null,
        }),
      );
      onClose();
    } catch {
      setError('連線失敗，請確認網路後再試');
    }
    setBusy('');
  }

  async function refresh() {
    setBusy('gps');
    await onRefresh();
    setBusy('');
    onClose();
  }

  async function backToAuto() {
    clearManualLocation();
    await refresh();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>📍 目前位置</h2>

        <div className="loc-current">
          <strong>{location ? locationLabel(location) : '還沒有位置資訊'}</strong>
          <span className="meta">
            {location
              ? [
                  location.source === 'manual' ? '手動指定' : 'GPS 定位',
                  stale ? '上次位置（這次沒定到）' : `${new Date(location.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} 取得`,
                  `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
                ].join('・')
              : '定位後「我的名單」會只骰你現在這個國家的店'}
          </span>
        </div>

        <div className="sheet-actions" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={refresh} disabled={!!busy}>
            {busy === 'gps' ? <span className="spinner" /> : '🔄 重新定位'}
          </button>
          {location?.source === 'manual' && (
            <button className="btn secondary" onClick={backToAuto} disabled={!!busy}>
              ↩️ 回自動
            </button>
          )}
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label>✍️ 手動指定（GPS 抓不到、或想先看別的地方時）</label>
          {options.length > 0 && (
            <div className="chips" style={{ marginBottom: 8 }}>
              {options.map((o) => (
                <button key={o.key} className="chip" onClick={() => applyOption(o)}>
                  {[o.country, o.city].filter(Boolean).join(' ')}（{o.count}）
                </button>
              ))}
            </div>
          )}
          <div className="field-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyQuery();
              }}
              placeholder="或輸入地名，例：東京 新宿站"
            />
            <button className="mini-btn" onClick={applyQuery} disabled={!!busy || !query.trim()}>
              {busy === 'search' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '前往'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <p className="lookup-msg">
            手動指定會一直有效；等 GPS 判定你已經在別的國家時會自動切回自動定位。
          </p>
        </div>

        <div className="sheet-actions">
          <button className="btn secondary" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
