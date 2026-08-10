'use client';

import { useEffect, useRef, useState } from 'react';

/** 預覽窗的邊長 (CSS px)；匯出時按比例放大到 OUT */
const VIEW = 260;
/** 存進 localStorage 的縮圖邊長：卡片上只有 64px，240 夠 retina 又不會塞爆容量 */
const OUT = 240;
const QUALITY = 0.78;
const MAX_ZOOM = 4;

/**
 * 釉窗：拖曳照片、縮放，窗口形狀就是卡片上縮圖的形狀，
 * 所以「你在窗裡看到的」就是「卡片上會出現的」。
 */
export default function ThumbEditor({
  src,
  onDone,
  onClose,
}: {
  /** 要裁切的圖（data URL 或 blob URL） */
  src: string;
  onDone: (thumb: string) => void;
  onClose: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const el = new Image();
    el.onload = () => setImg(el);
    el.onerror = () => setError('這張圖讀不進來，換一張試試');
    el.src = src;
  }, [src]);

  /** 讓圖至少填滿窗口的縮放倍率 */
  const cover = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const drawW = img ? img.naturalWidth * cover * zoom : 0;
  const drawH = img ? img.naturalHeight * cover * zoom : 0;

  /** 夾住位移，窗口永遠不會露出背景 */
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - drawW, o.x)),
    y: Math.min(0, Math.max(VIEW - drawH, o.y)),
  });

  // 換圖或縮放後重新居中／夾住
  useEffect(() => {
    if (!img) return;
    setOffset((o) =>
      o.x === 0 && o.y === 0
        ? { x: (VIEW - drawW) / 2, y: (VIEW - drawH) / 2 }
        : {
            x: Math.min(0, Math.max(VIEW - drawW, o.x)),
            y: Math.min(0, Math.max(VIEW - drawH, o.y)),
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(
      clamp({
        x: drag.current.ox + (e.clientX - drag.current.x),
        y: drag.current.oy + (e.clientY - drag.current.y),
      }),
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  /** 用跟預覽一樣的數學把窗內的範圍畫進 canvas */
  function save() {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = OUT / VIEW;
    ctx.drawImage(img, offset.x * k, offset.y * k, drawW * k, drawH * k);
    onDone(canvas.toDataURL('image/jpeg', QUALITY));
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>✂️ 調整縮圖</h2>
        <p className="lookup-msg" style={{ marginBottom: 12 }}>
          拖曳照片決定要露出哪一塊，窗口就是卡片上縮圖的樣子。
        </p>

        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <>
            <div className="glaze-window-wrap">
              <div
                className="glaze-window"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: offset.x,
                      top: offset.y,
                      width: drawW,
                      height: drawH,
                    }}
                  />
                )}
                <span className="glaze-rim" aria-hidden="true" />
              </div>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="thumb-zoom">縮放</label>
              <input
                id="thumb-zoom"
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.02}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="glaze-zoom"
              />
            </div>
          </>
        )}

        <div className="sheet-actions">
          <button className="btn secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save} disabled={!img}>
            用這一塊
          </button>
        </div>
      </div>
    </div>
  );
}
