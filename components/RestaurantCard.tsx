'use client';

import { useRef, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { mapsUrl } from '@/lib/store';
import { formatDistance } from '@/lib/country-bbox';

/** 左滑後露出的動作區寬度 (px) */
const ACTIONS_WIDTH = 132;

export default function RestaurantCard({
  r,
  km,
  onEdit,
  onDelete,
  onToggleFavorite,
}: {
  r: SavedRestaurant;
  /** 離目前位置多遠（開「📍 這附近」時才傳） */
  km?: number | null;
  onEdit: (r: SavedRestaurant) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (r: SavedRestaurant) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  // 手勢方向鎖定：垂直捲動交還瀏覽器，水平才由我們接管
  const axis = useRef<'h' | 'v' | null>(null);
  const swiped = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, base: offset };
    axis.current = null;
    swiped.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (axis.current === 'h') {
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }
    if (axis.current !== 'h') return;
    swiped.current = true;
    setOffset(Math.min(0, Math.max(-ACTIONS_WIDTH, start.current.base + dx)));
  };

  const endDrag = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (axis.current === 'h') setOffset((o) => (o < -ACTIONS_WIDTH / 2 ? -ACTIONS_WIDTH : 0));
    axis.current = null;
    // 只擋放開瞬間伴隨的合成 click，之後（點編輯/刪除）恢復正常
    if (swiped.current) setTimeout(() => (swiped.current = false), 80);
  };

  return (
    <div
      className="card-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        // 剛滑動完的 click 不當成點擊（避免誤觸導航連結）
        if (swiped.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="swipe-actions">
        <button
          className="swipe-btn edit"
          onClick={() => {
            setOffset(0);
            onEdit(r);
          }}
        >
          ✏️<span>編輯</span>
        </button>
        <button
          className="swipe-btn delete"
          onClick={() => {
            setOffset(0);
            onDelete(r.id);
          }}
        >
          🗑️<span>刪除</span>
        </button>
      </div>

      <div
        className="card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {r.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="thumb" src={r.thumb} alt="" draggable={false} />
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
            {km != null && (
              <span className="chip accent">
                📍 <span className="num">{formatDistance(km)}</span>
              </span>
            )}
            {r.visibility === 'friends' && <span className="chip">👥 已分享</span>}
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
          <button
            className="icon-btn"
            style={{ fontSize: 17, lineHeight: 1, color: r.favorite ? 'var(--bamboo)' : undefined }}
            aria-label={r.favorite ? '移出我的最愛' : '加入我的最愛'}
            onClick={() => onToggleFavorite(r)}
          >
            {r.favorite ? '❤️' : '🤍'}
          </button>
          <a className="nav-link" href={mapsUrl(r)} target="_blank" rel="noreferrer" draggable={false}>
            📍 導航
          </a>
        </div>
      </div>
    </div>
  );
}
