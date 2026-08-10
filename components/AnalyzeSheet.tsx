'use client';

import { useEffect, useState } from 'react';
import type { AnalyzeResult, ExtractedRestaurant, NearbyPlace, SavedRestaurant } from '@/lib/types';
import { toAnalyzePayload, toThumb } from '@/lib/image';
import { getPreferredProvider } from '@/lib/provider-pref';
import { analyzeLocal, getLocalConfig } from '@/lib/local-mode';
import { buildPrompt } from '@/lib/analyze-shared';
import { readExifGps } from '@/lib/exif';
import { countryOf, formatDistance, distanceKm } from '@/lib/country-bbox';
import { buildGoogleUrl } from '@/lib/place-url';
import type { DeviceLocation } from '@/lib/location';

type Phase = 'locating' | 'analyzing' | 'review' | 'error';

/** 可編輯的抽取結果（拍照模式會多帶對照到的店家座標） */
type Draft = ExtractedRestaurant & {
  include: boolean;
  lat?: number | null;
  lng?: number | null;
  googleUrl?: string | null;
  /** AI 從照片本身讀到的地址：換候選店家時若新的那家沒地址，退回這個而不是沿用上一家的 */
  ocrAddress?: string | null;
};

/** 拍照模式：先查這個半徑內的店家給 AI 對照，找不到再放寬 */
const RADII = [250, 800];

export default function AnalyzeSheet({
  file,
  kind = 'screenshot',
  location,
  onSave,
  onClose,
}: {
  file: Blob;
  /** photo = 現場拍的照片（會用 GPS + 附近店家清單辨識）；screenshot = 社群截圖 */
  kind?: 'screenshot' | 'photo';
  location: DeviceLocation | null;
  onSave: (items: SavedRestaurant[]) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(kind === 'photo' ? 'locating' : 'analyzing');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  /** 拍照模式：附近店家清單與定位來源說明 */
  const [candidates, setCandidates] = useState<NearbyPlace[]>([]);
  const [geoNote, setGeoNote] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let cancelled = false;

    /** 決定照片的座標：EXIF 優先（相簿舊照就是在那裡拍的），否則用目前位置 */
    async function resolveShotLocation() {
      const exif = await readExifGps(file);
      if (exif) {
        setGeoNote('已用照片本身的 GPS 位置對照附近店家');
        return exif;
      }
      if (location) {
        const from = location.source === 'manual' ? '手動指定的位置' : '你目前的位置';
        setGeoNote(`這張照片沒有 GPS 資訊，改用${from}對照附近店家`);
        return { lat: location.lat, lng: location.lng };
      }
      setGeoNote('沒有位置資訊，只能靠照片上的文字辨識');
      return null;
    }

    /** 由近到遠排序：模型清單與候選 chip 都以最近的優先，站在店門口時第一個通常就是答案 */
    async function fetchCandidates(at: { lat: number; lng: number }) {
      for (const radius of RADII) {
        try {
          const res = await fetch(`/api/nearby?lat=${at.lat}&lng=${at.lng}&radius=${radius}`);
          const data = (await res.json()) as { places?: NearbyPlace[] };
          const places = (data.places ?? []).filter((p) => p.name);
          if (places.length) {
            return places.sort((a, b) => {
              const da = a.lat != null && a.lng != null ? distanceKm(at, { lat: a.lat, lng: a.lng }) : Infinity;
              const db = b.lat != null && b.lng != null ? distanceKm(at, { lat: b.lat, lng: b.lng }) : Infinity;
              return da - db;
            });
          }
        } catch {
          /* 換下一個半徑，或最後回空清單 */
        }
      }
      return [];
    }

    (async () => {
      try {
        // 拍照模式：先定位 → 查附近店家，再連照片一起丟給 AI 指認
        let nearby: NearbyPlace[] = [];
        let at: { lat: number; lng: number } | null = null;
        if (kind === 'photo') {
          at = await resolveShotLocation();
          if (cancelled) return;
          if (at) {
            nearby = await fetchCandidates(at);
            if (cancelled) return;
            setCandidates(nearby);
          }
          setPhase('analyzing');
        }

        const { base64, mediaType } = await toAnalyzePayload(file);
        const provider = getPreferredProvider();
        const mode = kind === 'photo' ? 'photo' : 'screenshot';
        let result: AnalyzeResult;

        if (provider === 'local') {
          // 本機模式：瀏覽器直連裝置上的模型，照片不經過伺服器
          const cfg = getLocalConfig();
          if (!cfg) {
            setError('尚未完成本機模式設置，請到 ⚙️ 設定 → 本機模式。');
            setPhase('error');
            return;
          }
          try {
            result = await analyzeLocal(cfg, { base64, mediaType }, buildPrompt(mode, nearby));
          } catch (e) {
            if (cancelled) return;
            setError(e instanceof Error ? e.message : '本機分析失敗');
            setPhase('error');
            return;
          }
        } else {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: base64,
              mediaType,
              provider: provider ?? undefined,
              mode,
              candidates: nearby.map((p) => ({ name: p.name, address: p.address })),
            }),
          });
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setError(data.error || '分析失敗');
            setPhase('error');
            return;
          }
          result = data as AnalyzeResult;
        }
        if (cancelled) return;
        if (!result.is_food_content || result.restaurants.length === 0) {
          setError(
            kind === 'photo'
              ? '這張照片看不出是哪家店，換個角度拍招牌試試？'
              : '這張截圖裡沒有找到餐廳資訊，換一張試試？',
          );
          setPhase('error');
          return;
        }
        // 拍照模式：把 AI 指認到的附近店家資料（正式店名/地址/座標）套進草稿
        setDrafts(result.restaurants.map((r) => applyCandidate(toDraft(r), r.nearby_index, nearby)));
        setPhase('review');
      } catch {
        if (!cancelled) {
          setError('連線失敗，請確認網路後再試。');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, kind]);

  const updateDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  /** 點「不是這家？」的候選 chip：整組換成那家店 */
  const switchTo = (i: number, index: number | null) =>
    setDrafts((ds) =>
      ds.map((d, j) => (j === i ? applyCandidate({ ...d, name: d.name }, index, candidates) : d)),
    );

  async function handleSave() {
    setSaving(true);
    const thumb = await toThumb(file).catch(() => null);
    const chosen = drafts.filter((d) => d.include && d.name.trim());

    const items: SavedRestaurant[] = await Promise.all(
      chosen.map(async (d) => {
        // 拍照模式對照到店家時已經有精確座標；否則有地址就地理編碼（失敗不擋儲存）
        let lat = d.lat ?? null;
        let lng = d.lng ?? null;
        if (lat == null && (d.address || d.city)) {
          const address = d.address ?? d.city ?? '';
          for (const q of [[d.name, address].filter(Boolean).join(' '), address]) {
            try {
              const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
              const g = await res.json();
              if (g.lat != null && g.lng != null) {
                lat = g.lat;
                lng = g.lng;
                break;
              }
            } catch {
              /* 離線或失敗都可之後補 */
            }
          }
        }

        // 國家用離線表算（零成本）；拍照模式再補正式的縣市/行政區
        const hit = countryOf(lat, lng);
        let city = d.city;
        let district = d.district ?? null;
        let country = hit?.name ?? null;
        let countryCode = hit?.code ?? null;
        if (kind === 'photo' && lat != null && lng != null) {
          try {
            const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
            const g = await res.json();
            city = g.city ?? city;
            district = g.district ?? null;
            country = g.country ?? country;
            countryCode = g.countryCode ?? countryCode;
          } catch {
            /* 用離線表的結果就好 */
          }
        }

        return {
          id: crypto.randomUUID(),
          name: d.name.trim(),
          address: d.address,
          city,
          district,
          country,
          countryCode,
          cuisine: d.cuisine,
          dishes: d.dishes,
          priceRange: d.price_range,
          sourcePlatform: d.source_platform ?? (kind === 'photo' ? '拍照記錄' : null),
          notes: d.notes,
          lat,
          lng,
          thumb,
          googleUrl: d.googleUrl ?? null,
          createdAt: new Date().toISOString(),
        };
      }),
    );
    onSave(items);
  }

  const here = location && { lat: location.lat, lng: location.lng };

  return (
    <div className="overlay" onClick={phase === 'review' || phase === 'error' ? onClose : undefined}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {(phase === 'locating' || phase === 'analyzing') && (
          <div className="pick">
            <span className="emoji">{phase === 'locating' ? '📡' : '🔎'}</span>
            <h3>
              {phase === 'locating' ? '定位並查附近店家' : 'AI 分析中'} <span className="spinner" />
            </h3>
            <p className="meta">
              {phase === 'locating'
                ? '讀取照片位置、列出附近的店家…'
                : kind === 'photo'
                  ? `辨識招牌文字並比對附近${candidates.length ? ` ${candidates.length} 家` : ''}店家…`
                  : '正在從截圖辨識店名、地址與推薦菜色…'}
            </p>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="preview-img" src={preview} alt="預覽" style={{ marginTop: 14 }} />
            )}
          </div>
        )}

        {phase === 'error' && (
          <>
            <h2>😅 沒抓到</h2>
            <p className="error-text">{error}</p>
            {geoNote && <p className="lookup-msg">{geoNote}</p>}
            <div className="sheet-actions">
              <button className="btn secondary" onClick={onClose}>
                關閉
              </button>
            </div>
          </>
        )}

        {phase === 'review' && (
          <>
            <h2>
              {kind === 'photo' ? '確認是這家店嗎？' : `找到 ${drafts.length} 家餐廳，確認後儲存`}
            </h2>
            {kind === 'photo' && geoNote && <p className="lookup-msg" style={{ marginBottom: 10 }}>📍 {geoNote}</p>}
            {drafts.map((d, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                  opacity: d.include ? 1 : 0.45,
                }}
              >
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => updateDraft(i, { include: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  收藏這家
                  {d.confidence !== 'high' && (
                    <span className="chip" title="AI 對這筆的判讀信心較低，建議核對">
                      ⚠️ 建議核對
                    </span>
                  )}
                  {d.lat != null && (
                    <span className="chip accent" title="已對照到地圖上的店家，座標精確">
                      ✅ 已對照地圖
                    </span>
                  )}
                </label>
                <div className="field">
                  <label>店名</label>
                  <input value={d.name} onChange={(e) => updateDraft(i, { name: e.target.value })} />
                </div>
                <div className="field">
                  <label>地址</label>
                  <input
                    value={d.address ?? ''}
                    placeholder={kind === 'photo' ? '照片與清單都沒有地址，可手動補上' : '截圖沒有地址，可手動補上'}
                    onChange={(e) => updateDraft(i, { address: e.target.value || null })}
                  />
                </div>
                {/* 拍照模式：AI 挑錯了可以整組換成其他候選 */}
                {kind === 'photo' && candidates.length > 0 && (
                  <div className="field">
                    <label>不是這家？換一家附近的</label>
                    <div className="chips">
                      {alternateList(d, candidates).map(({ index, place }) => (
                        <button
                          key={index}
                          className="chip"
                          onClick={() => switchTo(i, index)}
                          title={place.address ?? undefined}
                        >
                          {place.name}
                          {here && place.lat != null && place.lng != null
                            ? `・${formatDistance(distanceKm(here, { lat: place.lat, lng: place.lng }))}`
                            : ''}
                        </button>
                      ))}
                      {d.lat != null && (
                        <button className="chip" onClick={() => switchTo(i, null)}>
                          都不是，用招牌文字
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="field">
                  <label>備註</label>
                  <input
                    value={d.notes ?? ''}
                    onChange={(e) => updateDraft(i, { notes: e.target.value || null })}
                  />
                </div>
                <div className="chips">
                  {d.cuisine && <span className="chip accent">{d.cuisine}</span>}
                  {d.price_range && <span className="chip">{d.price_range}</span>}
                  {d.source_platform && <span className="chip">來自 {d.source_platform}</span>}
                  {d.dishes.map((dish) => (
                    <span className="chip" key={dish}>
                      {dish}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="sheet-actions">
              <button className="btn secondary" onClick={onClose} disabled={saving}>
                取消
              </button>
              <button
                className="btn primary"
                onClick={handleSave}
                disabled={saving || drafts.every((d) => !d.include)}
              >
                {saving ? <span className="spinner" /> : '💾 存進口袋名單'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const toDraft = (r: ExtractedRestaurant): Draft => ({
  ...r,
  include: true,
  ocrAddress: r.address,
});

/** 把附近清單第 index 家的正式資料套進草稿；index=null 表示回到招牌原文、清掉座標 */
function applyCandidate(draft: Draft, index: number | null | undefined, candidates: NearbyPlace[]): Draft {
  if (index == null || index < 0 || index >= candidates.length) {
    return { ...draft, address: draft.ocrAddress ?? null, lat: null, lng: null, googleUrl: null };
  }
  const place = candidates[index];
  return {
    ...draft,
    name: place.name,
    // 新的店家沒地址就用照片上讀到的，絕不沿用上一家候選的地址
    address: place.address ?? draft.ocrAddress ?? null,
    cuisine: draft.cuisine ?? place.cuisine,
    lat: place.lat,
    lng: place.lng,
    googleUrl: buildGoogleUrl({ name: place.name, address: place.address, lat: place.lat, lng: place.lng }),
  };
}

/**
 * 候選 chip：AI 給的 alternate_indexes 排前面，再補幾家最近的湊到 4 個，
 * 並排除目前已經套用的那家（避免點了沒反應）。
 */
function alternateList(draft: Draft, candidates: NearbyPlace[]) {
  const current = candidates.findIndex((c) => c.name === draft.name && c.lat === draft.lat);
  const order = [
    ...(draft.alternate_indexes ?? []),
    ...candidates.map((_, i) => i),
  ].filter((i) => i >= 0 && i < candidates.length && i !== current);
  const seen = new Set<number>();
  return order
    .filter((i) => !seen.has(i) && (seen.add(i), true))
    .slice(0, 4)
    .map((index) => ({ index, place: candidates[index] }));
}
