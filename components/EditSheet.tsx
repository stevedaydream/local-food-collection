'use client';

import { useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';

export default function EditSheet({
  initial,
  onSave,
  onClose,
}: {
  /** 有值＝編輯既有收藏；null＝手動新增 */
  initial: SavedRestaurant | null;
  onSave: (item: SavedRestaurant) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [cuisine, setCuisine] = useState(initial?.cuisine ?? '');
  const [priceRange, setPriceRange] = useState(initial?.priceRange ?? '');
  const [dishes, setDishes] = useState(initial?.dishes.join('、') ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);

    // 地址有變（或還沒有座標）就重新地理編碼；失敗不擋儲存
    let lat = initial?.lat ?? null;
    let lng = initial?.lng ?? null;
    const newAddress = address.trim() || null;
    const addressChanged = (initial?.address ?? null) !== newAddress;
    if (newAddress && (addressChanged || lat == null)) {
      try {
        const q = [name.trim(), newAddress].join(' ');
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const g = await res.json();
        lat = g.lat ?? null;
        lng = g.lng ?? null;
      } catch {
        /* 離線或失敗都可之後補 */
      }
    } else if (!newAddress && addressChanged) {
      lat = null;
      lng = null;
    }

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      address: newAddress,
      city: initial?.city ?? null,
      cuisine: cuisine.trim() || null,
      dishes: dishes
        .split(/[、,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      priceRange: priceRange.trim() || null,
      sourcePlatform: initial ? initial.sourcePlatform : '手動輸入',
      notes: notes.trim() || null,
      lat,
      lng,
      thumb: initial?.thumb ?? null,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? '✏️ 編輯收藏' : '✏️ 手動新增餐廳'}</h2>
        <div className="field">
          <label>店名（必填）</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：阿宏麵線" />
        </div>
        <div className="field">
          <label>地址</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="有地址才能導航與定位"
          />
        </div>
        <div className="field">
          <label>料理類型</label>
          <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="例：台式小吃" />
        </div>
        <div className="field">
          <label>價位</label>
          <input value={priceRange} onChange={(e) => setPriceRange(e.target.value)} placeholder="例：$ / $$ / 100-200" />
        </div>
        <div className="field">
          <label>推薦菜色（用「、」分隔）</label>
          <input value={dishes} onChange={(e) => setDishes(e.target.value)} placeholder="例：大腸麵線、蚵仔煎" />
        </div>
        <div className="field">
          <label>備註</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="sheet-actions">
          <button className="btn secondary" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <span className="spinner" /> : '💾 儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
