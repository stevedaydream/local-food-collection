'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NearbyPlace, SavedRestaurant } from '@/lib/types';
import { mapsUrl, updateRestaurant } from '@/lib/store';
import { countryOf, distanceKm, formatDistance } from '@/lib/country-bbox';
import { locationLabel, type DeviceLocation } from '@/lib/location';
import { fetchPublicNearby } from '@/lib/public-pool';
import DiceRoll from './DiceRoll';

type Mode = 'pocket' | 'nearby';
type Source = 'pocket' | 'nearby' | 'public';

/** 本國收藏少於這個數量時，混入附近搜尋結果一起骰 */
const MIX_THRESHOLD = 5;
/** 口袋收藏的權重（附近與公共庫各 1 票） */
const POCKET_WEIGHT = 3;
/** 附近搜尋結果快取多久 */
const NEARBY_TTL_MS = 10 * 60 * 1000;
/** 移動超過這個距離就重新搜附近（公里） */
const NEARBY_MOVE_KM = 0.5;

/** 口袋收藏與附近搜尋統一成同一種候選格式 */
interface Candidate {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cuisine: string | null;
  dishes: string[];
  rating: number | null;
  googleUrl?: string | null;
  source: Source;
  /** 離目前位置的距離（沒位置或沒座標時為 null） */
  km: number | null;
  weight: number;
}

const SOURCE_LABEL: Record<Source, string> = {
  pocket: '🍜 口袋',
  nearby: '📍 附近',
  public: '🌐 公共庫',
};

/** 這家店在哪一國：優先用存下來的 countryCode，舊資料用座標推 */
const codeOf = (r: SavedRestaurant) => r.countryCode ?? countryOf(r.lat, r.lng)?.code ?? null;

/** 附近搜尋結果快取（跨開關骰子畫面保留，避免每次都打 GPS 與 Overpass） */
let nearbyCache: { lat: number; lng: number; at: number; list: Candidate[] } | null = null;

export default function RandomSheet({
  restaurants,
  location,
  onClose,
  onListChanged,
}: {
  restaurants: SavedRestaurant[];
  /** 目前位置（app/page.tsx 解析好傳進來）；null = 沒有位置資訊，這時不分區 */
  location: DeviceLocation | null;
  onClose: () => void;
  /** 批次補座標後把新名單交回主畫面 */
  onListChanged?: (list: SavedRestaurant[]) => void;
}) {
  const [mode, setMode] = useState<Mode>(restaurants.length ? 'pocket' : 'nearby');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Candidate[] | null>(null);
  const [nearbyNote, setNearbyNote] = useState('');
  const [nearbyError, setNearbyError] = useState('');
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [rolling, setRolling] = useState(false);
  // 每次開骰換一個 key，強制 DiceRoll 重新掛載；否則在動畫途中再次開骰，
  // 舊實例的計時器已經跑掉、onDone 不會再觸發，骰子就會一直轉不停
  const [rollId, setRollId] = useState(0);
  const [pick, setPick] = useState<Candidate | null>(null);
  const [fixing, setFixing] = useState('');

  const poolRef = useRef<Candidate[]>([]);
  const lastPickName = useRef<string | null>(null);

  const here = location && { lat: location.lat, lng: location.lng };
  /** 有位置才做國家硬篩；完全沒有位置資訊時照舊全部一起骰 */
  const filtering = !!location?.countryCode;

  const cuisines = useMemo(
    () => Array.from(new Set(restaurants.map((r) => r.cuisine).filter((c): c is string => !!c))),
    [restaurants],
  );

  const toCandidate = (r: SavedRestaurant): Candidate => ({
    name: r.name,
    address: [r.city, r.district].filter(Boolean).join(' ') || r.address,
    lat: r.lat,
    lng: r.lng,
    cuisine: r.cuisine,
    dishes: r.dishes,
    rating: null,
    googleUrl: r.googleUrl ?? null,
    source: 'pocket',
    km: here && r.lat != null && r.lng != null ? distanceKm(here, { lat: r.lat, lng: r.lng }) : null,
    weight: POCKET_WEIGHT,
  });

  /** 口袋名單依料理類型 → 國家硬篩 → 距離排序，並算出被排除的原因 */
  const pocket = useMemo(() => {
    const byCuisine = cuisine ? restaurants.filter((r) => r.cuisine === cuisine) : restaurants;
    if (!filtering) {
      return { list: byCuisine.map(toCandidate), otherCountry: 0, noLocation: 0 };
    }
    const local: SavedRestaurant[] = [];
    let otherCountry = 0;
    let noLocation = 0;
    for (const r of byCuisine) {
      if (r.lat == null || r.lng == null) {
        noLocation++;
        continue;
      }
      const code = codeOf(r);
      if (code == null) noLocation++;
      else if (code === location!.countryCode) local.push(r);
      else otherCountry++;
    }
    const list = local.map(toCandidate).sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return { list, otherCountry, noLocation };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurants, cuisine, filtering, location?.countryCode, location?.lat, location?.lng]);

  /** 本國收藏不足就混入附近候選（口袋權重較高，且標示來源） */
  const mixed = mode === 'pocket' && pocket.list.length < MIX_THRESHOLD && !!here;
  const pool =
    mode === 'nearby'
      ? (nearby ?? [])
      : mixed
        ? [...pocket.list, ...dedupe(pocket.list, nearby ?? [])]
        : pocket.list;

  const startRoll = (cands: Candidate[]) => {
    poolRef.current = cands;
    setPick(null);
    setRollId((n) => n + 1);
    setRolling(true);
  };

  /** 骰子動畫播完 → 依權重抽一家（多於一家時避免連骰同一家） */
  const finishRoll = () => {
    const cands = poolRef.current;
    let next = weightedPick(cands);
    if (next && cands.length > 1 && next.name === lastPickName.current) {
      next = weightedPick(cands.filter((c) => c.name !== next!.name)) ?? next;
    }
    lastPickName.current = next?.name ?? null;
    setPick(next);
    setRolling(false);
  };

  async function fetchNearby(force = false) {
    if (!here) {
      setNearbyError('沒有位置資訊，請點標題列的 📍 定位後再試');
      return [];
    }
    // 10 分鐘內、且沒走超過 500m 就沿用上次結果
    if (
      !force &&
      nearbyCache &&
      Date.now() - nearbyCache.at < NEARBY_TTL_MS &&
      distanceKm(here, nearbyCache) < NEARBY_MOVE_KM
    ) {
      setNearby(nearbyCache.list);
      setNearbyNote(`已用目前位置搜尋（${Math.round((Date.now() - nearbyCache.at) / 60000)} 分鐘前的結果）`);
      return nearbyCache.list;
    }

    setLoadingNearby(true);
    setNearbyError('');
    try {
      // 地圖來源 + 公共美食庫並行查詢，公共庫失敗不影響主流程
      const [res, pubPlaces] = await Promise.all([
        fetch(`/api/nearby?lat=${here.lat}&lng=${here.lng}`),
        fetchPublicNearby(here.lat, here.lng).catch(() => [] as NearbyPlace[]),
      ]);
      const data = (await res.json()) as { places?: NearbyPlace[]; source?: string };
      const mapPlaces = (data.places ?? []).map((p) => fromNearby(p, 'nearby', here));
      const seen = new Set(mapPlaces.map((p) => p.name));
      const list = [
        ...mapPlaces,
        ...pubPlaces.filter((p) => !seen.has(p.name)).map((p) => fromNearby(p, 'public', here)),
      ].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));

      nearbyCache = { lat: here.lat, lng: here.lng, at: Date.now(), list };
      setNearbyNote(
        `已用目前位置搜尋${data.source === 'osm' ? '・OSM 資料（設定 Google key 結果更準）' : ''}`,
      );
      setNearby(list);
      if (!list.length) setNearbyError('附近找不到餐廳，晚點再試或換個地點');
      setLoadingNearby(false);
      return list;
    } catch {
      setNearbyError('搜尋失敗，請確認網路後再試');
      setLoadingNearby(false);
      return [];
    }
  }

  // 開啟、切換來源/料理類型、或位置變了：需要附近候選就取（fetchNearby 自己判斷快取是否還算數）
  useEffect(() => {
    (async () => {
      if (mode === 'nearby') {
        const list = await fetchNearby();
        if (list.length) startRoll(list);
        return;
      }
      // 我的名單：本國不足就混入附近候選再骰
      if (pocket.list.length < MIX_THRESHOLD && here) {
        const list = await fetchNearby();
        const merged = [...pocket.list, ...dedupe(pocket.list, list)];
        if (merged.length) startRoll(merged);
        else setPick(null);
        return;
      }
      if (pocket.list.length) startRoll(pocket.list);
      else setPick(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cuisine, location?.countryCode, location?.lat, location?.lng]);

  /** 幫沒有座標的收藏補地理編碼（1 筆/秒，符合 Nominatim 使用政策） */
  async function fixMissingCoords() {
    const targets = restaurants.filter((r) => (r.lat == null || r.lng == null) && (r.address || r.city));
    if (!targets.length) return;
    let list = restaurants;
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      setFixing(`補座標中… ${i + 1}/${targets.length}`);
      try {
        const address = r.address ?? r.city ?? '';
        // 店名查不到時只用地址再試一次：Nominatim 對沒登錄的小店會整筆查不到，
        // 但同一條路的地址查得到（實測「測試店 台北市信義區松高路」失敗、去掉店名就成功）
        const g = await geocode([r.name, address].filter(Boolean).join(' '), address);
        if (g.lat != null && g.lng != null) {
          const hit = countryOf(g.lat, g.lng);
          list = updateRestaurant({
            ...r,
            lat: g.lat,
            lng: g.lng,
            country: r.country ?? hit?.name ?? null,
            countryCode: r.countryCode ?? hit?.code ?? null,
          });
        }
      } catch {
        /* 單筆失敗略過，下次還可以再補 */
      }
      if (i < targets.length - 1) await new Promise((r2) => setTimeout(r2, 1100));
    }
    setFixing('');
    onListChanged?.(list);
  }

  const others = pick ? pool.filter((c) => c.name !== pick.name).slice(0, 12) : [];
  const fixable = restaurants.filter((r) => (r.lat == null || r.lng == null) && (r.address || r.city)).length;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="chips" style={{ marginBottom: 12 }}>
          <button className={`chip ${mode === 'pocket' ? 'accent' : ''}`} onClick={() => setMode('pocket')}>
            🍜 我的名單
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

        {mode === 'pocket' && !loadingNearby && (
          <p className="meta" style={{ marginBottom: 8 }}>
            {filtering ? (
              <>
                📍 {locationLabel(location)}
                {location!.source === 'manual' ? '（手動指定）' : ''}・按距離排序
                {mixed && `・本國只有 ${pocket.list.length} 家，已混入附近店家`}
                {pocket.otherCountry > 0 && `・${pocket.otherCountry} 家在其他國家未納入`}
              </>
            ) : (
              '未取得位置，暫時不分區（點標題列的 📍 可以定位）'
            )}
            {pocket.noLocation > 0 && `・${pocket.noLocation} 家沒有位置資訊`}
            {fixable > 0 && filtering && (
              <button
                className="mini-btn"
                style={{ marginLeft: 6, padding: '2px 8px', fontSize: 12 }}
                onClick={fixMissingCoords}
                disabled={!!fixing}
              >
                {fixing || `🔍 補座標（${fixable}）`}
              </button>
            )}
          </p>
        )}

        {mode === 'nearby' && nearbyNote && !loadingNearby && !nearbyError && (
          <p className="meta" style={{ marginBottom: 8 }}>
            {location ? `📍 ${locationLabel(location)}・` : ''}
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

        {/* 附近搜尋失敗只在「真的沒東西可骰」時才報錯；口袋還有候選就安靜地少混一點 */}
        {nearbyError && !loadingNearby && !pool.length && (
          <>
            <p className="error-text">{nearbyError}</p>
            <div className="sheet-actions">
              <button
                className="btn secondary"
                onClick={async () => {
                  const list = await fetchNearby(true);
                  if (list.length) startRoll(mode === 'nearby' ? list : [...pocket.list, ...dedupe(pocket.list, list)]);
                }}
              >
                🔄 再試一次
              </button>
            </div>
          </>
        )}

        {mode === 'pocket' && !pool.length && !loadingNearby && (
          <div className="empty">
            <span className="emoji">🕳️</span>
            {filtering
              ? `${locationLabel(location)} 這裡還沒有收藏，附近也沒搜到店家。`
              : '口袋名單還是空的，先去存幾家餐廳，'}
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
              {pick.km != null ? ` ・${formatDistance(pick.km)}` : ''}
              {pick.cuisine ? ` ・${pick.cuisine}` : ''}
              {pick.rating ? ` ・⭐ ${pick.rating}` : ''}
            </p>
            <div className="chips" style={{ justifyContent: 'center', marginTop: 8 }}>
              <span className={`chip ${pick.source === 'pocket' ? 'accent' : ''}`}>
                {SOURCE_LABEL[pick.source]}
              </span>
              {pick.dishes.slice(0, 3).map((d) => (
                <span className="chip" key={d}>
                  {d}
                </span>
              ))}
            </div>
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
                  <div className="other-row" key={`${o.source}-${o.name}`}>
                    <span className="other-name">{o.name}</span>
                    <span className={`other-meta${o.km != null ? ' num' : ''}`}>
                      {o.km != null ? formatDistance(o.km) : (o.rating ? `⭐ ${o.rating}` : (o.cuisine ?? ''))}
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

      {rolling && <DiceRoll key={rollId} onDone={finishRoll} />}
    </div>
  );
}

/** 地理編碼，依序試每個查詢字串，第一個查到座標的就採用 */
async function geocode(...queries: string[]): Promise<{ lat: number | null; lng: number | null }> {
  for (const q of queries.filter(Boolean)) {
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const g = (await res.json()) as { lat: number | null; lng: number | null };
      if (g.lat != null && g.lng != null) return g;
    } catch {
      /* 換下一個查詢字串 */
    }
    await new Promise((r) => setTimeout(r, 1100)); // Nominatim 使用政策：1 req/s
  }
  return { lat: null, lng: null };
}

function fromNearby(p: NearbyPlace, source: Source, here: { lat: number; lng: number }): Candidate {
  return {
    ...p,
    dishes: [],
    source,
    km: p.lat != null && p.lng != null ? distanceKm(here, { lat: p.lat, lng: p.lng }) : null,
    weight: 1,
  };
}

/** 附近結果去掉已經在口袋名單裡的（同店名） */
function dedupe(pocket: Candidate[], nearby: Candidate[]): Candidate[] {
  const seen = new Set(pocket.map((c) => c.name));
  return nearby.filter((c) => !seen.has(c.name));
}

/** 依 weight 加權隨機（口袋每家 3 票、附近與公共庫各 1 票） */
function weightedPick(cands: Candidate[]): Candidate | null {
  if (!cands.length) return null;
  const total = cands.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * total;
  for (const c of cands) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return cands[cands.length - 1];
}
