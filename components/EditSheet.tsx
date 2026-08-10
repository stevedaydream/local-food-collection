'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { countryOf } from '@/lib/country-bbox';
import ThumbEditor from './ThumbEditor';

export default function EditSheet({
  initial,
  initialPaste = '',
  autoResolve = false,
  onSave,
  onClose,
}: {
  /** 有值＝編輯既有收藏；null＝手動新增 */
  initial: SavedRestaurant | null;
  /** 預先填進「貼上」欄位的內容（分享進來的文字、剪貼簿） */
  initialPaste?: string;
  /** 開啟時就自動解析 initialPaste（從分享選單進來時用） */
  autoResolve?: boolean;
  onSave: (item: SavedRestaurant) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [district, setDistrict] = useState(initial?.district ?? '');
  // 反查帶回來的國家（推薦的國家硬篩要用）；沒查到就在儲存時用座標推
  const region = useRef<{ country: string | null; countryCode: string | null }>({
    country: initial?.country ?? null,
    countryCode: initial?.countryCode ?? null,
  });
  const [cuisine, setCuisine] = useState(initial?.cuisine ?? '');
  const [priceRange, setPriceRange] = useState(initial?.priceRange ?? '');
  const [dishes, setDishes] = useState(initial?.dishes.join('、') ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [googleUrl, setGoogleUrl] = useState(initial?.googleUrl ?? '');
  const [shared, setShared] = useState(initial?.visibility === 'friends');
  const [thumb, setThumb] = useState<string | null>(initial?.thumb ?? null);
  /** 要送進釉窗裁切的圖；null = 沒有在裁切 */
  const [cropping, setCropping] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState(initialPaste);
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState('');
  // 搜尋帶入的座標；儲存時若地址沒再被改過就直接沿用，不必重查
  const found = useRef<{ address: string; lat: number | null; lng: number | null } | null>(null);

  /**
   * 萬用解析：q 可以是地址、店名，或 Google 地圖連結（含分享出來的短網址），
   * 查得到就把店名／地址／地區／連結一起補進表單。
   */
  async function resolve(q: string) {
    if (!q.trim() || looking) return;
    setLooking(true);
    setLookupMsg('');
    try {
      const res = await fetch(`/api/resolve-place?q=${encodeURIComponent(q.trim())}`);
      const p = await res.json();
      if (!p.name && !p.address) {
        setLookupMsg(p.message ?? '查不到這家店，補上縣市或路名再試一次');
        setLooking(false);
        return;
      }
      const filled: string[] = [];
      if (p.name) {
        setName(p.name);
        filled.push(`店名「${p.name}」`);
      }
      if (p.address) {
        setAddress(p.address);
        found.current = { address: p.address, lat: p.lat ?? null, lng: p.lng ?? null };
        filled.push('地址');
      }
      // 地區以反查到的正式行政區為準（篩選與 widget 選區域都靠它，格式要統一）
      if (p.city) setCity(p.city);
      if (p.district) setDistrict(p.district);
      if (p.countryCode) region.current = { country: p.country ?? null, countryCode: p.countryCode };
      if (p.cuisine && !cuisine.trim()) setCuisine(p.cuisine);
      if (p.googleUrl) {
        setGoogleUrl(p.googleUrl);
        filled.push('Google 地圖連結');
      }
      setLookupMsg(
        `✅ 已帶入${filled.join('、')}；請核對後儲存` + (p.message ? `\n⚠️ ${p.message}` : ''),
      );
    } catch {
      setLookupMsg('連線失敗，請確認網路後再試');
    }
    setLooking(false);
  }

  // 從分享選單帶文字進來：直接開始解析，使用者只要確認
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoResolve || autoRan.current || !initialPaste.trim()) return;
    autoRan.current = true;
    resolve(initialPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResolve, initialPaste]);

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
      // 先用「店名+地址」查（比較精準），查不到再只用地址——沒登錄的小店加了店名會整筆查不到
      for (const q of [`${name.trim()} ${newAddress}`, newAddress]) {
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
    } else if (!newAddress && addressChanged) {
      lat = null;
      lng = null;
    }

    // 反查沒給國家就用座標推（離線表），推不到就留空 → 推薦時算「未知位置」
    const byCoords = countryOf(lat, lng);
    const country = region.current.country ?? byCoords?.name ?? null;
    const countryCode = region.current.countryCode ?? byCoords?.code ?? null;

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      address: newAddress,
      city: city.trim() || null,
      district: district.trim() || null,
      country,
      countryCode,
      cuisine: cuisine.trim() || null,
      dishes: dishes
        .split(/[、,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      priceRange: priceRange.trim() || null,
      sourcePlatform: initial
        ? initial.sourcePlatform
        : /https?:\/\//.test(paste)
          ? 'Google 地圖'
          : '手動輸入',
      notes: notes.trim() || null,
      lat,
      lng,
      thumb,
      googleUrl: googleUrl.trim() || null,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      visibility: shared ? 'friends' : 'private',
      favorite: initial?.favorite ?? false,
    });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? '✏️ 編輯收藏' : '✏️ 新增餐廳'}</h2>

        {/* 縮圖：換照片、重新裁切、移除 */}
        <div className="thumb-row">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="thumb-preview" src={thumb} alt="縮圖預覽" />
          ) : (
            <div className="thumb-preview">🍽️</div>
          )}
          <div className="thumb-actions">
            <button className="mini-btn" onClick={() => photoInput.current?.click()}>
              📷 {thumb ? '換照片' : '加照片'}
            </button>
            {thumb && (
              <>
                <button className="mini-btn" onClick={() => setCropping(thumb)}>
                  ✂️ 調整
                </button>
                <button className="mini-btn" onClick={() => setThumb(null)}>
                  移除
                </button>
              </>
            )}
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setCropping(URL.createObjectURL(f));
            }}
          />
        </div>

        <div className="paste-box">
          <label>✨ 貼上地址或 Google 地圖連結，自動填好</label>
          <div className="field-row">
            <input
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') resolve(paste);
              }}
              placeholder="台北市…路 100 號 ／ https://maps.app.goo.gl/…"
            />
            <button
              className="mini-btn"
              onClick={() => resolve(paste)}
              disabled={looking || !paste.trim()}
              title="貼地址自動抓店名與 Google 連結；貼 Google 連結自動抓店名與地址"
            >
              {looking ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '✨ 自動填入'}
            </button>
          </div>
          <p className="lookup-msg">
            在 Google 地圖按「分享」複製的連結也可以直接貼；殼 App 還能從分享選單直接傳進來。
          </p>
        </div>

        <div className="field">
          <label>店名（必填）</label>
          <div className="field-row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：阿宏麵線" />
            <button
              className="mini-btn"
              onClick={() => resolve([name.trim(), address.trim()].filter(Boolean).join(' '))}
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
          <label>Google 地圖連結</label>
          <div className="field-row">
            <input
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="有連結的話「導航」會直接開這家店的地圖頁"
            />
            {googleUrl.trim() && (
              <a
                className="mini-btn"
                href={googleUrl.trim()}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
              >
                🔗 開啟
              </a>
            )}
          </div>
        </div>
        <div className="field">
          <label>地區（縣市 / 行政區）</label>
          <div className="field-row">
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="例：台北市、東京都" />
            <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="例：信義區" />
          </div>
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

      {cropping && (
        <ThumbEditor
          src={cropping}
          onDone={(next) => {
            setThumb(next);
            closeCropper();
          }}
          onClose={closeCropper}
        />
      )}
    </div>
  );

  function closeCropper() {
    // 從相簿選的圖是 blob URL，用完要放掉
    if (cropping?.startsWith('blob:')) URL.revokeObjectURL(cropping);
    setCropping(null);
  }
}
