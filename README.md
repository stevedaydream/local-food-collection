# 🍜 口袋美食地圖 local-food-collection

在 IG / Threads / 小紅書看到好吃的餐廳，截圖存了就忘在哪？
這個 App 讓你把截圖**分享進來 → AI 自動分析歸檔 → 不知道吃什麼時一鍵隨機推薦**。

## 功能

- 📸 **截圖 AI 分析**：上傳（或從分享選單傳入）社群貼文截圖，Claude Vision 自動抽出店名、地址、料理類型、推薦菜色、來源平台與備註，一張截圖可辨識多家餐廳（清單型貼文也 OK）
- ✅ **儲存前確認**：AI 結果可先編輯、勾選要收藏哪幾家；信心較低的欄位會標示「建議核對」
- 📋 **口袋名單**：卡片列表 + 料理類型標籤，附截圖縮圖
- 🗺️ **美食地圖**：有地址的餐廳自動地理編碼（Nominatim），標在 Leaflet 地圖上
- 🎲 **吃什麼？**：一鍵隨機推薦，顯示店名 + 地址 + Google Maps 導航連結，可按料理類型篩選、不滿意就「換一家」
- 📲 **PWA（類 widget 體驗）**：
  - 安裝到手機主畫面，**長按圖示 → 「🎲 吃什麼」捷徑**直接彈出隨機推薦
  - Android：在任何 App 截圖後按「分享」→ 選「美食地圖」，直接進入 AI 分析（Web Share Target）
  - iOS：加入主畫面後從相簿分享或 App 內上傳（iOS 尚不支援 PWA share target，見 Roadmap）
- 💾 **資料在你手上**：收藏存在裝置 localStorage，支援 JSON 匯出備份 / 匯入

## 快速開始

```bash
cp .env.example .env        # 填入你的 ANTHROPIC_API_KEY
npm install
npm run dev                 # http://localhost:3000
```

部署到 Vercel：import 這個 repo，在專案設定加上環境變數 `ANTHROPIC_API_KEY` 即可。

> PWA 安裝與 Web Share Target 需要 HTTPS（Vercel 預設就有）。

## 架構

```
截圖分享/上傳 ──► 前端縮圖壓縮 ──► POST /api/analyze
                                     │  Claude (claude-opus-4-8) Vision
                                     │  + structured output（JSON Schema）
                                     ▼
                             確認/編輯畫面 ──► GET /api/geocode（Nominatim 地址轉座標）
                                     ▼
                             localStorage 收藏 ──► 名單 / 地圖 / 隨機推薦
```

| 路徑 | 說明 |
|---|---|
| `app/api/analyze/route.ts` | Claude Vision 截圖分析，以 JSON Schema 結構化輸出保證格式 |
| `app/api/geocode/route.ts` | 地址 → 座標（OpenStreetMap Nominatim 代理，含快取） |
| `lib/store.ts` | localStorage 收藏 CRUD、匯出/匯入、Google Maps 連結產生 |
| `components/AnalyzeSheet.tsx` | 分析中 → 確認編輯 → 儲存 的流程 |
| `components/RandomSheet.tsx` | 隨機推薦（可依料理類型篩選） |
| `components/MapView.tsx` | Leaflet + OSM 地圖 |
| `public/sw.js` | Service worker：PWA 安裝 + 接收分享的截圖 |
| `public/manifest.webmanifest` | PWA 設定：主畫面捷徑、share_target |

## Roadmap

- [ ] **真正的主畫面 widget**：需要原生外殼（iOS WidgetKit / Android Glance）。過渡方案：iOS 可用「捷徑」App 建一個開啟 `https://你的網址/?random=1` 的捷徑放主畫面
- [ ] **iOS 分享截圖進 App**：用「捷徑」建立分享表單捷徑，把圖片 POST 到 `/api/analyze`
- [ ] **跨裝置同步**：接 Supabase（Auth + Postgres + Storage），取代 localStorage
- [ ] 依目前位置排序／「附近的口袋名單」推薦
- [ ] 已吃過 / 想吃 狀態與評分

## 注意事項

- Nominatim 為免費服務，僅適合個人低流量使用；正式產品請換 Google Geocoding 或 Mapbox
- 截圖僅在分析當下傳給 Claude API，不會被儲存在伺服器
