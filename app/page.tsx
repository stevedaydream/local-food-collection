'use client';

import { useEffect, useRef, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { addRestaurants, exportJson, importJson, loadRestaurants, removeRestaurant, updateRestaurant } from '@/lib/store';
import { syncToWidget } from '@/lib/widget-sync';
import RestaurantCard from '@/components/RestaurantCard';
import AnalyzeSheet from '@/components/AnalyzeSheet';
import RandomSheet from '@/components/RandomSheet';
import EditSheet from '@/components/EditSheet';
import SettingsSheet from '@/components/SettingsSheet';
// 地圖暫時下架；MapView 保留為未來 Google Maps API 的接口（components/MapView.tsx）

export default function Home() {
  const [restaurants, setRestaurants] = useState<SavedRestaurant[]>([]);
  const [ready, setReady] = useState(false);
  const [analyzeFile, setAnalyzeFile] = useState<Blob | null>(null);
  const [showRandom, setShowRandom] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  /** EditSheet 狀態：null=關閉、'new'=手動新增、物件=編輯該筆 */
  const [editTarget, setEditTarget] = useState<SavedRestaurant | 'new' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadRestaurants();
    setRestaurants(loaded);
    setReady(true);
    // Capacitor 殼內：開 App 時把名單種子同步給原生 widget
    syncToWidget(loaded);

    const params = new URLSearchParams(window.location.search);
    // 主畫面捷徑「🎲 吃什麼」直接彈出隨機推薦
    if (params.get('random') === '1') setShowRandom(true);

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
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="設定">
            ⚙️
          </button>
        </span>
      </header>

      <section className="content">
        {!ready ? null : restaurants.length === 0 ? (
          <div className="empty">
            <span className="emoji">📸</span>
            在 IG、Threads、小紅書看到好吃的？
            <br />
            截圖後按下方「截圖新增」，AI 幫你自動歸檔。
            <br />
            安裝到主畫面後，也可以直接把截圖「分享」進來。
          </div>
        ) : (
          restaurants.map((r) => (
            <RestaurantCard key={r.id} r={r} onEdit={setEditTarget} onDelete={handleDelete} />
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
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </main>
  );
}
