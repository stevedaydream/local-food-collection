'use client';

import { useMemo, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { mapsUrl } from '@/lib/store';

export default function RandomSheet({
  restaurants,
  onClose,
}: {
  restaurants: SavedRestaurant[];
  onClose: () => void;
}) {
  const [seed, setSeed] = useState(0);
  const [cuisine, setCuisine] = useState<string | null>(null);

  const cuisines = useMemo(
    () => Array.from(new Set(restaurants.map((r) => r.cuisine).filter((c): c is string => !!c))),
    [restaurants],
  );

  const pool = cuisine ? restaurants.filter((r) => r.cuisine === cuisine) : restaurants;

  const pick = useMemo(() => {
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
    // seed 變動時重抽
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, seed]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {cuisines.length > 1 && (
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

        {pick ? (
          <div className="pick">
            <span className="emoji">🎲</span>
            <h3>{pick.name}</h3>
            <p className="meta">
              {pick.address || pick.city || '（沒有地址資訊）'}
              {pick.cuisine ? ` ・${pick.cuisine}` : ''}
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
              <button className="btn secondary" onClick={() => setSeed((s) => s + 1)}>
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
          </div>
        ) : (
          <div className="empty">
            <span className="emoji">🕳️</span>
            口袋名單還是空的，先去存幾家餐廳吧！
          </div>
        )}
      </div>
    </div>
  );
}
