'use client';

import type { SavedRestaurant } from '@/lib/types';
import { mapsUrl } from '@/lib/store';

export default function RestaurantCard({
  r,
  onDelete,
}: {
  r: SavedRestaurant;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card">
      {r.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="thumb" src={r.thumb} alt="" />
      ) : (
        <div className="thumb" style={{ display: 'grid', placeItems: 'center', fontSize: 26 }}>
          🍽️
        </div>
      )}
      <div className="body">
        <h3>{r.name}</h3>
        <div className="meta">
          {r.address || r.city || '（沒有地址資訊）'}
          {r.notes ? <div>📝 {r.notes}</div> : null}
        </div>
        <div className="chips">
          {r.cuisine && <span className="chip accent">{r.cuisine}</span>}
          {r.priceRange && <span className="chip">{r.priceRange}</span>}
          {r.sourcePlatform && <span className="chip">來自 {r.sourcePlatform}</span>}
          {r.dishes.slice(0, 3).map((d) => (
            <span className="chip" key={d}>
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="card-actions">
        <a className="nav-link" href={mapsUrl(r)} target="_blank" rel="noreferrer">
          📍 導航
        </a>
        <button className="icon-btn" onClick={() => onDelete(r.id)} aria-label="刪除">
          🗑️
        </button>
      </div>
    </div>
  );
}
