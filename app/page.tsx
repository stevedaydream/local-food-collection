'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedRestaurant } from '@/lib/types';
import { addRestaurants, exportJson, importJson, loadRestaurants, removeRestaurant, saveRestaurants, updateRestaurant } from '@/lib/store';
import { pullAndMerge } from '@/lib/cloud-sync';
import { syncLocationToWidget, syncToWidget } from '@/lib/widget-sync';
import { takePendingSharedImage, takePendingSharedText } from '@/lib/native-share';
import { checkApkUpdate } from '@/lib/app-update';
import RestaurantCard from '@/components/RestaurantCard';
import AnalyzeSheet from '@/components/AnalyzeSheet';
import RandomSheet from '@/components/RandomSheet';
import EditSheet from '@/components/EditSheet';
import SettingsSheet from '@/components/SettingsSheet';
import FriendsSheet from '@/components/FriendsSheet';
import LocationPanel from '@/components/LocationPanel';
import { canAutoLocate, locationLabel, resolveLocation, type DeviceLocation } from '@/lib/location';
import { countryOf, distanceKm } from '@/lib/country-bbox';
import { stashPendingInvite, tryAcceptPendingInvite } from '@/lib/friends';
// 地圖暫時下架；MapView 保留為未來 Google Maps API 的接口（components/MapView.tsx）

export default function Home() {
  const [restaurants, setRestaurants] = useState<SavedRestaurant[]>([]);
  const [ready, setReady] = useState(false);
  const [analyzeFile, setAnalyzeFile] = useState<Blob | null>(null);
  const [showRandom, setShowRandom] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  // 目前位置：推薦的國家硬篩與 header 那一行都用它
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [locStale, setLocStale] = useState(false);
  const [locNote, setLocNote] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  /** EditSheet 狀態：null=關閉、'new'=手動新增、物件=編輯該筆 */
  const [editTarget, setEditTarget] = useState<SavedRestaurant | 'new' | null>(null);
  /** 開 EditSheet 時預填進「貼上」欄位的內容，autoResolve=從分享進來要直接解析 */
  const [pasteSeed, setPasteSeed] = useState<{ text: string; autoResolve: boolean }>({
    text: '',
    autoResolve: false,
  });
  // 條件篩選（空字串 = 不篩）
  const [fSource, setFSource] = useState('');
  const [fCity, setFCity] = useState('');
  const [fCuisine, setFCuisine] = useState('');
  const [fFavorite, setFFavorite] = useState(false);
  /** 只看目前所在國家、並按距離排序 */
  const [fNear, setFNear] = useState(false);

  const uniq = (xs: (string | null)[]) =>
    Array.from(new Set(xs.filter((x): x is string => !!x))).sort();
  const sources = useMemo(() => uniq(restaurants.map((r) => r.sourcePlatform)), [restaurants]);
  const cities = useMemo(() => uniq(restaurants.map((r) => r.city)), [restaurants]);
  const cuisines = useMemo(() => uniq(restaurants.map((r) => r.cuisine)), [restaurants]);

  /** 這家店在哪一國：優先用存下來的 countryCode，舊資料用座標推 */
  const codeOf = (r: SavedRestaurant) => r.countryCode ?? countryOf(r.lat, r.lng)?.code ?? null;
  /** 離目前位置多遠（沒位置或沒座標時為 null），開「📍 這附近」時卡片會顯示 */
  const kmOf = (r: SavedRestaurant) =>
    location && r.lat != null && r.lng != null
      ? distanceKm({ lat: location.lat, lng: location.lng }, { lat: r.lat, lng: r.lng })
      : null;

  const nearOn = fNear && !!location?.countryCode;
  const filtered = restaurants
    .filter(
      (r) =>
        (!fFavorite || r.favorite) &&
        (!fSource || r.sourcePlatform === fSource) &&
        (!fCity || r.city === fCity) &&
        (!fCuisine || r.cuisine === fCuisine) &&
        (!nearOn || codeOf(r) === location!.countryCode),
    )
    .sort((a, b) => (nearOn ? (kmOf(a) ?? Infinity) - (kmOf(b) ?? Infinity) : 0));
  const filterOn = !!(fSource || fCity || fCuisine || fFavorite || fNear);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadRestaurants();
    setRestaurants(loaded);
    setReady(true);
    // Capacitor 殼內：開 App 時把名單種子同步給原生 widget、檢查 APK 是否有新版
    syncToWidget(loaded);
    checkApkUpdate();

    // 之前授權過（或成功定位過）才自動抓位置，不主動彈權限視窗
    canAutoLocate().then((ok) => {
      if (ok) refreshLocation();
    });

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

    // 分享文字/連結進來（Google 地圖 → 分享 → 美食地圖）：開表單自動解析
    // 殼 App 走原生 plugin，瀏覽器 PWA 走 service worker 暫存的 cache
    if (params.get('share-text') === '1') {
      (async () => {
        let text = await takePendingSharedText();
        if (!text) {
          try {
            const cache = await caches.open('shared-images');
            const res = await cache.match('/shared-text');
            if (res) {
              text = (await res.text()).trim();
              await cache.delete('/shared-text');
            }
          } catch {
            /* 不支援 cache API 就略過 */
          }
        }
        if (!text) return;
        setPasteSeed({ text, autoResolve: true });
        setEditTarget('new');
      })();
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

  /** 重新定位（開 App 自動、或面板按重新定位）；force=使用者主動要求，忽略快取 */
  const refreshLocation = async (force = false) => {
    const { loc, stale, manualReleased } = await resolveLocation(force);
    setLocation(loc);
    setLocStale(stale);
    // 殼內：把位置推給原生 widget 的「📍 跟著我的位置」
    syncLocationToWidget(loc);
    if (manualReleased && loc) setLocNote(`已切回自動定位（偵測到你在${loc.country ?? '別的國家'}）`);
  };

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

  /** 「🔗 貼連結」：能讀剪貼簿就先填好（讀不到就開空欄位讓使用者自己貼） */
  const handleOpenPaste = async () => {
    let text = '';
    try {
      text = (await navigator.clipboard.readText()).trim().slice(0, 600);
    } catch {
      /* 沒授權或不支援剪貼簿讀取：留空 */
    }
    setPasteSeed({ text, autoResolve: false });
    setEditTarget('new');
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
        <div className="header-row">
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
        </div>
        <button className="loc-line" onClick={() => setShowLocation(true)}>
          📍{' '}
          {location ? (
            <>
              {locationLabel(location)}
              {locStale && <span className="loc-tag">上次位置</span>}
              {location.source === 'manual' && <span className="loc-tag">手動</span>}
            </>
          ) : (
            '點一下顯示所在地'
          )}
          {locNote && <span className="loc-tag">{locNote}</span>}
        </button>
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
            <button
              className="icon-btn"
              style={fNear ? { background: 'var(--surface-2)', outline: '2px solid var(--accent)', outlineOffset: -1 } : undefined}
              aria-label="只看目前所在國家並按距離排序"
              aria-pressed={fNear}
              title={
                location?.countryCode
                  ? `只看${location.country ?? '目前國家'}的收藏，並按距離排序`
                  : '需要先定位（點上方的 📍）'
              }
              onClick={() => {
                if (!location?.countryCode) {
                  setShowLocation(true);
                  return;
                }
                setFNear((v) => !v);
              }}
            >
              📍 這附近
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
                  setFNear(false);
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
            截圖後按下方「📸 截圖」，AI 幫你自動歸檔。
            <br />
            或按「🔗 貼連結」貼 Google 地圖連結／地址，店名與位置自動補齊。
            <br />
            安裝到主畫面後，截圖和地圖連結都能直接「分享」進來。
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
              km={nearOn ? kmOf(r) : null}
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
          📸 截圖
        </button>
        <button className="btn secondary" onClick={handleOpenPaste}>
          🔗 貼連結
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            setPasteSeed({ text: '', autoResolve: false });
            setEditTarget('new');
          }}
        >
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
      {showRandom && (
        <RandomSheet
          restaurants={restaurants}
          location={location}
          onListChanged={setRestaurants}
          onClose={() => setShowRandom(false)}
        />
      )}
      {showLocation && (
        <LocationPanel
          restaurants={restaurants}
          location={location}
          stale={locStale}
          onApply={(loc) => {
            setLocation(loc);
            setLocStale(false);
            setLocNote('');
            syncLocationToWidget(loc);
          }}
          onRefresh={async () => {
            setLocNote('');
            await refreshLocation(true);
          }}
          onClose={() => setShowLocation(false)}
        />
      )}
      {editTarget && (
        <EditSheet
          initial={editTarget === 'new' ? null : editTarget}
          initialPaste={editTarget === 'new' ? pasteSeed.text : ''}
          autoResolve={editTarget === 'new' && pasteSeed.autoResolve}
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
