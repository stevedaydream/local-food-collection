'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { addRestaurants, exportJson, importJson, loadRestaurants, removeRestaurant, saveRestaurants, updateRestaurant } from '@/lib/store';
import { pullAndMerge } from '@/lib/cloud-sync';
import { syncToWidget } from '@/lib/widget-sync';
import { takePendingSharedImage } from '@/lib/native-share';
import { checkApkUpdate } from '@/lib/app-update';
import RestaurantCard from '@/components/RestaurantCard';
import AnalyzeSheet from '@/components/AnalyzeSheet';
import RandomSheet from '@/components/RandomSheet';
import EditSheet from '@/components/EditSheet';
import SettingsSheet from '@/components/SettingsSheet';
import FriendsSheet from '@/components/FriendsSheet';
import { stashPendingInvite, tryAcceptPendingInvite } from '@/lib/friends';
// 地圖暫時下架；MapView 保留為未來 Google Maps API 的接口（components/MapView.tsx）

export default function Home() {
  const [restaurants, setRestaurants] = useState<SavedRestaurant[]>([]);
  const [ready, setReady] = useState(false);
  const [analyzeFile, setAnalyzeFile] = useState<Blob | null>(null);
  const [showRandom, setShowRandom] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  /** EditSheet 狀態：null=關閉、'new'=手動新增、物件=編輯該筆 */
  const [editTarget, setEditTarget] = useState<SavedRestaurant | 'new' | null>(null);
  // 條件篩選（空字串 = 不篩）
  const [fSource, setFSource] = useState('');
  const [fCity, setFCity] = useState('');
  const [fCuisine, setFCuisine] = useState('');
  const [fFavorite, setFFavorite] = useState(false);

  const uniq = (xs: (string | null)[]) =>
    Array.from(new Set(xs.filter((x): x is string => !!x))).sort();
  const sources = useMemo(() => uniq(restaurants.map((r) => r.sourcePlatform)), [restaurants]);
  const cities = useMemo(() => uniq(restaurants.map((r) => r.city)), [restaurants]);
  const cuisines = useMemo(() => uniq(restaurants.map((r) => r.cuisine)), [restaurants]);

  const filtered = restaurants.filter(
    (r) =>
      (!fFavorite || r.favorite) &&
      (!fSource || r.sourcePlatform === fSource) &&
      (!fCity || r.city === fCity) &&
      (!fCuisine || r.cuisine === fCuisine),
  );
  const filterOn = !!(fSource || fCity || fCuisine || fFavorite);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadRestaurants();
    setRestaurants(loaded);
    setReady(true);
    // Capacitor 殼內：開 App 時把名單種子同步給原生 widget、檢查 APK 是否有新版
    syncToWidget(loaded);
    checkApkUpdate();

    // 已登入的話拉雲端清單合併（saveRestaurants 會順便把合併結果推回雲端）
    pullAndMerge(loaded)
      .then((merged) => {
        if (merged) {
          saveRestaurants(merged);
          setRestaurants(merged);
        }
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    // 主畫面捷徑「🎲 吃什麼」直接彈出隨機推薦
    if (params.get('random') === '1') setShowRandom(true);

    // 朋友邀請連結：已登入直接接受；未登入先暫存並引導去設定登入
    const inviteCode = params.get('invite');
    if (inviteCode) {
      stashPendingInvite(inviteCode);
      tryAcceptPendingInvite().then((msg) => {
        if (msg) {
          alert(msg);
          setShowFriends(true);
        } else {
          alert('請先用 Google 登入，登入後會自動加為好友');
          setShowSettings(true);
        }
      });
    }

    // Capacitor 殼內分享截圖進來（原生 ACTION_SEND）：跟原生 plugin 取圖
    if (params.get('share-native') === '1') {
      takePendingSharedImage().then((b) => {
        if (b) setAnalyzeFile(b);
      });
    }

    // Android 分享截圖進來（Web Share Target）：service worker 把圖放進 cache
    if (params.get('share-target') === '1') {
      (async () => {
        try {
          const cache = await caches.open('shared-images');
          const res = await cache.match('/shared-image');
          if (res) {
            setAnalyzeFile(await res.blob());
            await cache.delete('/shared-image');
          }
        } catch {
          /* 不支援 cache API 就略過 */
        }
      })();
    }
    if (params.toString()) window.history.replaceState(null, '', '/');
  }, []);

  const handleSaved = (items: SavedRestaurant[]) => {
    setRestaurants(addRestaurants(items));
    setAnalyzeFile(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('確定要刪除這家餐廳？')) setRestaurants(removeRestaurant(id));
  };

  const handleEditSave = (item: SavedRestaurant) => {
    setRestaurants(editTarget === 'new' ? addRestaurants([item]) : updateRestaurant(item));
    setEditTarget(null);
  };

  const handleToggleFavorite = (r: SavedRestaurant) => {
    setRestaurants(updateRestaurant({ ...r, favorite: !r.favorite }));
  };

  const handleExport = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `food-map-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = async (f: File) => {
    try {
      setRestaurants(importJson(await f.text()));
    } catch {
      alert('匯入失敗：檔案格式不正確');
    }
  };

  return (
    <main className="app">
      <header className="header">
        <h1>
          🍜 口袋<span>美食地圖</span>
        </h1>
        <span className="meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {restaurants.length} 家收藏
          <button className="icon-btn" onClick={() => setShowFriends(true)} aria-label="朋友">
            👥
          </button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="設定">
            ⚙️
          </button>
        </span>
      </header>

      <section className="content">
        {ready && restaurants.length > 0 && (
          <div className="filter-bar">
            <button
              className="icon-btn"
              style={fFavorite ? { background: 'var(--surface-2)', outline: '2px solid var(--accent)', outlineOffset: -1 } : undefined}
              aria-label="只看我的最愛"
              aria-pressed={fFavorite}
              onClick={() => setFFavorite((v) => !v)}
            >
              {fFavorite ? '❤️ 最愛' : '🤍 最愛'}
            </button>
            <select value={fSource} onChange={(e) => setFSource(e.target.value)} aria-label="來源篩選">
              <option value="">來源</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={fCity} onChange={(e) => setFCity(e.target.value)} aria-label="地區篩選">
              <option value="">地區</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={fCuisine} onChange={(e) => setFCuisine(e.target.value)} aria-label="類型篩選">
              <option value="">類型</option>
              {cuisines.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {filterOn && (
              <button
                className="icon-btn"
                onClick={() => {
                  setFSource('');
                  setFCity('');
                  setFCuisine('');
                  setFFavorite(false);
                }}
              >
                ✕ 清除
              </button>
            )}
          </div>
        )}

        {!ready ? null : restaurants.length === 0 ? (
          <div className="empty">
            <span className="emoji">📸</span>
            在 IG、Threads、小紅書看到好吃的？
            <br />
            截圖後按下方「截圖新增」，AI 幫你自動歸檔。
            <br />
            安裝到主畫面後，也可以直接把截圖「分享」進來。
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <span className="emoji">🔍</span>
            沒有符合篩選條件的收藏，換個條件試試。
          </div>
        ) : (
          filtered.map((r) => (
            <RestaurantCard
              key={r.id}
              r={r}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onToggleFavorite={handleToggleFavorite}
            />
          ))
        )}

        {ready && restaurants.length > 0 && (
          <div className="footer-tools">
            <button onClick={handleExport}>匯出備份</button>
            <button onClick={() => importInput.current?.click()}>匯入</button>
          </div>
        )}
      </section>

      <div className="bottom-bar">
        <button className="btn secondary" onClick={() => fileInput.current?.click()}>
          📸 截圖新增
        </button>
        <button className="btn secondary" onClick={() => setEditTarget('new')}>
          ✏️ 手動
        </button>
        <button className="btn primary" onClick={() => setShowRandom(true)}>
          🎲 吃什麼？
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setAnalyzeFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.target.value = '';
        }}
      />

      {analyzeFile && (
        <AnalyzeSheet file={analyzeFile} onSave={handleSaved} onClose={() => setAnalyzeFile(null)} />
      )}
      {showRandom && <RandomSheet restaurants={restaurants} onClose={() => setShowRandom(false)} />}
      {editTarget && (
        <EditSheet
          initial={editTarget === 'new' ? null : editTarget}
          onSave={handleEditSave}
          onClose={() => setEditTarget(null)}
        />
      )}
      {showSettings && (
        <SettingsSheet onClose={() => setShowSettings(false)} onRestored={setRestaurants} />
      )}
      {showFriends && (
        <FriendsSheet onClose={() => setShowFriends(false)} onListChanged={setRestaurants} />
      )}
    </main>
  );
}
