'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NearbyPlace, SavedRestaurant } from '@/lib/types';
import { mapsUrl } from '@/lib/store';
import { getPosition } from '@/lib/geo';
import DiceRoll from './DiceRoll';

type Mode = 'pocket' | 'nearby';

/** 口袋收藏與附近搜尋統一成同一種候選格式 */
interface Candidate {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cuisine: string | null;
  dishes: string[];
  rating: number | null;
}

const toCandidate = (r: SavedRestaurant): Candidate => ({
  name: r.name,
  address: r.address ?? r.city,
  lat: r.lat,
  lng: r.lng,
  cuisine: r.cuisine,
  dishes: r.dishes,
  rating: null,
});

const nearbyToCandidate = (p: NearbyPlace): Candidate => ({ ...p, dishes: [] });

export default function RandomSheet({
  restaurants,
  onClose,
}: {
  restaurants: SavedRestaurant[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(restaurants.length ? 'pocket' : 'nearby');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Candidate[] | null>(null);
  const [nearbyNote, setNearbyNote] = useState('');
  const [nearbyError, setNearbyError] = useState('');
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [pick, setPick] = useState<Candidate | null>(null);

  const poolRef = useRef<Candidate[]>([]);
  const lastPickName = useRef<string | null>(null);

  const cuisines = useMemo(
    () => Array.from(new Set(restaurants.map((r) => r.cuisine).filter((c): c is string => !!c))),
    [restaurants],
  );

  const pocketPool = useMemo(
    () => (cuisine ? restaurants.filter((r) => r.cuisine === cuisine) : restaurants).map(toCandidate),
    [restaurants, cuisine],
  );

  const pool = mode === 'pocket' ? pocketPool : (nearby ?? []);

  const startRoll = (cands: Candidate[]) => {
    poolRef.current = cands;
    setPick(null);
    setRolling(true);
  };

  /** 骰子動畫播完 → 從候選池抽一家（多於一家時避免連骰同一家） */
  const finishRoll = () => {
    const cands = poolRef.current;
    let next = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
    if (next && cands.length > 1 && next.name === lastPickName.current) {
      next = cands[(cands.indexOf(next) + 1) % cands.length];
    }
    lastPickName.current = next?.name ?? null;
    setPick(next);
    setRolling(false);
  };

  async function fetchNearby() {
    setLoadingNearby(true);
    setNearbyError('');
    try {
      const pos = await getPosition();
      const res = await fetch(`/api/nearby?lat=${pos.lat}&lng=${pos.lng}`);
      const data = (await res.json()) as { places?: NearbyPlace[]; source?: string };
      const list = (data.places ?? []).map(nearbyToCandidate);
      setNearbyNote(
        (pos.fallback ? '定位失敗，先以台北市中心搜尋' : '已用目前位置搜尋') +
          (data.source === 'osm' ? '・OSM 資料（設定 Google key 結果更準）' : ''),
      );
      setNearby(list);
      if (list.length) startRoll(list);
      else setNearbyError('附近找不到餐廳，晚點再試或換個地點');
    } catch {
      setNearbyError('搜尋失敗，請確認網路後再試');
    }
    setLoadingNearby(false);
  }

  // 開啟、切換來源或料理類型時：有候選就骰，附近沒抓過就先搜
  useEffect(() => {
    if (mode === 'pocket') {
      if (pocketPool.length) startRoll(pocketPool);
      else setPick(null);
    } else if (nearby === null) {
      fetchNearby();
    } else if (nearby.length) {
      startRoll(nearby);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cuisine]);

  const others = pick ? pool.filter((c) => c.name !== pick.name).slice(0, 12) : [];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="chips" style={{ marginBottom: 12 }}>
          <button className={`chip ${mode === 'pocket' ? 'accent' : ''}`} onClick={() => setMode('pocket')}>
            🍜 口袋名單
          </button>
          <button className={`chip ${mode === 'nearby' ? 'accent' : ''}`} onClick={() => setMode('nearby')}>
            📍 附近
          </button>
        </div>

        {mode === 'pocket' && cuisines.length > 1 && (
          <div className="chips" style={{ marginBottom: 12 }}>
            <button className={`chip ${cuisine === null ? 'accent' : ''}`} onClick={() => setCuisine(null)}>
              全部
            </button>
            {cuisines.map((c) => (
              <button
                key={c}
                className={`chip ${cuisine === c ? 'accent' : ''}`}
                onClick={() => setCuisine(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {mode === 'nearby' && nearbyNote && !loadingNearby && !nearbyError && (
          <p className="meta" style={{ marginBottom: 8 }}>
            {nearbyNote}
          </p>
        )}

        {loadingNearby && (
          <div className="pick">
            <span className="emoji">📡</span>
            <h3>
              搜尋附近餐廳中 <span className="spinner" />
            </h3>
            <p className="meta">定位並搜尋你附近的店家…</p>
          </div>
        )}

        {nearbyError && !loadingNearby && (
          <>
            <p className="error-text">{nearbyError}</p>
            <div className="sheet-actions">
              <button
                className="btn secondary"
                onClick={() => {
                  setNearby(null);
                  fetchNearby();
                }}
              >
                🔄 再試一次
              </button>
            </div>
          </>
        )}

        {mode === 'pocket' && !pocketPool.length && (
          <div className="empty">
            <span className="emoji">🕳️</span>
            口袋名單還是空的，先去存幾家餐廳，
            <br />
            或切到「📍 附近」讓骰子幫你找。
          </div>
        )}

        {pick && !rolling && (
          <div className="pick">
            <span className="emoji">🎲</span>
            <h3>{pick.name}</h3>
            <p className="meta">
              {pick.address || '（沒有地址資訊）'}
              {pick.cuisine ? ` ・${pick.cuisine}` : ''}
              {pick.rating ? ` ・⭐ ${pick.rating}` : ''}
            </p>
            {pick.dishes.length > 0 && (
              <div className="chips" style={{ justifyContent: 'center', marginTop: 8 }}>
                {pick.dishes.slice(0, 4).map((d) => (
                  <span className="chip" key={d}>
                    {d}
                  </span>
                ))}
              </div>
            )}
            <div className="sheet-actions">
              <button className="btn secondary" onClick={() => startRoll(pool)}>
                🔄 換一家
              </button>
              <a
                className="btn primary"
                style={{ textDecoration: 'none', justifyContent: 'center' }}
                href={mapsUrl(pick)}
                target="_blank"
                rel="noreferrer"
              >
                📍 出發導航
              </a>
            </div>

            {others.length > 0 && (
              <div className="others">
                <p className="others-title">沒被骰到的還有：</p>
                {others.map((o) => (
                  <div className="other-row" key={o.name}>
                    <span className="other-name">{o.name}</span>
                    <span className="other-meta">
                      {o.rating ? `⭐ ${o.rating}` : (o.cuisine ?? '')}
                    </span>
                    <a href={mapsUrl(o)} target="_blank" rel="noreferrer">
                      導航
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {rolling && <DiceRoll onDone={finishRoll} />}
    </div>
  );
}
