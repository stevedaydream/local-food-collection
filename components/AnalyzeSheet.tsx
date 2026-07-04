'use client';

import { useEffect, useState } from 'react';
import type { AnalyzeResult, ExtractedRestaurant, SavedRestaurant } from '@/lib/types';
import { toAnalyzePayload, toThumb } from '@/lib/image';
import { getPreferredProvider } from '@/lib/provider-pref';

type Phase = 'analyzing' | 'review' | 'error';

/** 可編輯的抽取結果 */
type Draft = ExtractedRestaurant & { include: boolean };

export default function AnalyzeSheet({
  file,
  onSave,
  onClose,
}: {
  file: Blob;
  onSave: (items: SavedRestaurant[]) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { base64, mediaType } = await toAnalyzePayload(file);
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mediaType, provider: getPreferredProvider() ?? undefined }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || '分析失敗');
          setPhase('error');
          return;
        }
        const result = data as AnalyzeResult;
        if (!result.is_food_content || result.restaurants.length === 0) {
          setError('這張截圖裡沒有找到餐廳資訊，換一張試試？');
          setPhase('error');
          return;
        }
        setDrafts(result.restaurants.map((r) => ({ ...r, include: true })));
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
  }, [file]);

  const updateDraft = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  async function handleSave() {
    setSaving(true);
    const thumb = await toThumb(file).catch(() => null);
    const chosen = drafts.filter((d) => d.include && d.name.trim());

    const items: SavedRestaurant[] = await Promise.all(
      chosen.map(async (d) => {
        // 有地址就先地理編碼，讓地圖與導航更準；失敗不擋儲存
        let lat: number | null = null;
        let lng: number | null = null;
        const q = [d.name, d.address ?? d.city].filter(Boolean).join(' ');
        if (d.address || d.city) {
          try {
            const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
            const g = await res.json();
            lat = g.lat ?? null;
            lng = g.lng ?? null;
          } catch {
            /* 離線或失敗都可之後補 */
          }
        }
        return {
          id: crypto.randomUUID(),
          name: d.name.trim(),
          address: d.address,
          city: d.city,
          cuisine: d.cuisine,
          dishes: d.dishes,
          priceRange: d.price_range,
          sourcePlatform: d.source_platform,
          notes: d.notes,
          lat,
          lng,
          thumb,
          createdAt: new Date().toISOString(),
        };
      }),
    );
    onSave(items);
  }

  return (
    <div className="overlay" onClick={phase === 'analyzing' ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {phase === 'analyzing' && (
          <div className="pick">
            <span className="emoji">🔎</span>
            <h3>
              AI 分析中 <span className="spinner" />
            </h3>
            <p className="meta">正在從截圖辨識店名、地址與推薦菜色…</p>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="preview-img" src={preview} alt="截圖預覽" style={{ marginTop: 14 }} />
            )}
          </div>
        )}

        {phase === 'error' && (
          <>
            <h2>😅 沒抓到</h2>
            <p className="error-text">{error}</p>
            <div className="sheet-actions">
              <button className="btn secondary" onClick={onClose}>
                關閉
              </button>
            </div>
          </>
        )}

        {phase === 'review' && (
          <>
            <h2>找到 {drafts.length} 家餐廳，確認後儲存</h2>
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
                </label>
                <div className="field">
                  <label>店名</label>
                  <input value={d.name} onChange={(e) => updateDraft(i, { name: e.target.value })} />
                </div>
                <div className="field">
                  <label>地址</label>
                  <input
                    value={d.address ?? ''}
                    placeholder="截圖沒有地址，可手動補上"
                    onChange={(e) => updateDraft(i, { address: e.target.value || null })}
                  />
                </div>
                <div className="field">
                  <label>備註</label>
                  <input
                    value={d.notes ?? ''}
                    onChange={(e) => updateDraft(i, { notes: e.target.value || null })}
                  />
                </div>
                <div className="chips">
                  {d.cuisine && <span className="chip accent">{d.cuisine}</span>}
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
