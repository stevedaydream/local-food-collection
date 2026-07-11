'use client';

import { useRef, useState } from 'react';
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
  const [city, setCity] = useState(initial?.city ?? '');
  const [cuisine, setCuisine] = useState(initial?.cuisine ?? '');
  const [priceRange, setPriceRange] = useState(initial?.priceRange ?? '');
  const [dishes, setDishes] = useState(initial?.dishes.join('、') ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [shared, setShared] = useState(initial?.visibility === 'friends');
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState('');
  // 搜尋帶入的座標；儲存時若地址沒再被改過就直接沿用，不必重查
  const found = useRef<{ address: string; lat: number | null; lng: number | null } | null>(null);

  async function handleLookup() {
    if (!name.trim() || looking) return;
    setLooking(true);
    setLookupMsg('');
    try {
      const q = [name.trim(), address.trim()].filter(Boolean).join(' ');
      const res = await fetch(`/api/place-search?q=${encodeURIComponent(q)}`);
      const p = await res.json();
      if (p.address) {
        setAddress(p.address);
        found.current = { address: p.address, lat: p.lat ?? null, lng: p.lng ?? null };
        setLookupMsg('✅ 已帶入地址，儲存後導航會用這個位置');
      } else {
        setLookupMsg('找不到這家店，試試在店名或地址加上城市／路名再搜一次');
      }
    } catch {
      setLookupMsg('連線失敗，請確認網路後再試');
    }
    setLooking(false);
  }

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);

    // 地址有變（或還沒有座標）就重新地理編碼；失敗不擋儲存
    let lat = initial?.lat ?? null;
    let lng = initial?.lng ?? null;
    const newAddress = address.trim() || null;
    const addressChanged = (initial?.address ?? null) !== newAddress;
    if (newAddress && found.current?.address === newAddress && found.current.lat != null) {
      // 搜尋帶入且沒再改過 → 直接用搜尋結果的座標
      lat = found.current.lat;
      lng = found.current.lng;
    } else if (newAddress && (addressChanged || lat == null)) {
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
      city: city.trim() || null,
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
      visibility: shared ? 'friends' : 'private',
      favorite: initial?.favorite ?? false,
    });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? '✏️ 編輯收藏' : '✏️ 手動新增餐廳'}</h2>
        <div className="field">
          <label>店名（必填）</label>
          <div className="field-row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：阿宏麵線" />
            <button
              className="mini-btn"
              onClick={handleLookup}
              disabled={looking || !name.trim()}
              title="用店名搜尋地圖，自動帶入地址與導航位置"
            >
              {looking ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '🔍 找地址'}
            </button>
          </div>
        </div>
        <div className="field">
          <label>地址</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="有地址才能導航與定位"
          />
          {lookupMsg && <p className="lookup-msg">{lookupMsg}</p>}
        </div>
        <div className="field">
          <label>地區（縣市）</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="例：台北市" />
        </div>
        <div className="field">
          <label>類型</label>
          <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="例：早午餐、火鍋、台式小吃" />
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
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', fontSize: 14 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />
          <span>
            👥 分享給朋友
            <span className="meta" style={{ display: 'block', fontSize: 12 }}>
              需登入並加好友；對方會看到這筆的全部欄位（含備註與縮圖）
            </span>
          </span>
        </label>
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
