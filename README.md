# 🍜 口袋美食地圖 local-food-collection

在 IG / Threads / 小紅書看到好吃的餐廳，截圖存了就忘在哪？
這個 App 讓你把截圖**分享進來 → AI 自動分析歸檔 → 不知道吃什麼時一鍵隨機推薦**。

## 功能

- 📸 **截圖 AI 分析**：上傳（或從分享選單傳入）社群貼文截圖，Claude Vision 自動抽出店名、地址、料理類型、推薦菜色、來源平台與備註，一張截圖可辨識多家餐廳（清單型貼文也 OK）
- ✅ **儲存前確認**：AI 結果可先編輯、勾選要收藏哪幾家；信心較低的欄位會標示「建議核對」
- 📋 **口袋名單**：卡片列表 + 料理類型標籤，附截圖縮圖；卡片**左滑可編輯或刪除**
- ✏️ **手動新增**：沒有截圖也能直接輸入店名、地址等資訊收藏；店名旁「🔍 找地址」可搜尋地圖自動帶入正確地址與導航位置（設 `GOOGLE_MAPS_API_KEY` 走 Google Places，未設定退回 Nominatim）
- 🗺️ 地圖檢視暫時下架（`components/MapView.tsx` 保留為接口，未來改接 Google Maps API；地理編碼 `/api/geocode` 照常運作）
- 🎲 **吃什麼？**：2 秒全屏骰子動畫後隨機推薦，顯示店名 + 地址 + Google Maps 導航連結，並列出沒被骰到的其他候選；可按類型篩選、不滿意就「換一家」
  - **📍 附近模式**：口袋名單空空（或主動切換）時，用 GPS 定位（失敗退回台北市中心）搜尋附近餐廳來骰——設 `GOOGLE_MAPS_API_KEY` 走 Google Places Nearby（含評分），未設定退回 OSM Overpass
- 🔎 **條件篩選**：名單可依 來源（IG/FB…）× 地區（縣市）× 類型（早午餐、火鍋…）快速過濾，分類欄位在編輯表單都能補
- 📲 **PWA（類 widget 體驗）**：
  - 安裝到手機主畫面，**長按圖示 → 「🎲 吃什麼」捷徑**直接彈出隨機推薦
  - Android：在任何 App 截圖後按「分享」→ 選「美食地圖」，直接進入 AI 分析（Web Share Target）
  - iOS：加入主畫面後從相簿分享或 App 內上傳（iOS 尚不支援 PWA share target，見 Roadmap）
- 💾 **資料在你手上**：收藏存在裝置 localStorage，支援 JSON 匯出備份 / 匯入
- ☁️ **Google Drive 備份（免設定）**：⚙️ 設定內一鍵備份 / 還原——備份存在使用者自己 Drive 的隱藏應用程式空間（`drive.appdata` scope，App 碰不到其他檔案）；開發者只需設定一次 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`（見 `.env.example`），使用者只要選 Google 帳號。還原採合併（依 id 去重），換新機直接還原即可。Android Capacitor 殼內因 Google 擋 WebView OAuth 暫不支援，請用瀏覽器 / PWA

## AI 引擎（四種可選）

分析引擎可透過環境變數設定，**至少設定一組**；設定多組時可在 App 內 ⚙️ 切換：

| Provider | 必要環境變數 | 選用 | 預設模型 |
|---|---|---|---|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-opus-4-8` |
| GPT (OpenAI) | `OPENAI_API_KEY` | `OPENAI_MODEL`、`OPENAI_BASE_URL` | `gpt-4o` |
| Gemini (Google) | `GEMINI_API_KEY` | `GEMINI_MODEL` | `gemini-2.5-flash` |
| 自訂 Endpoint | `CUSTOM_BASE_URL` | `CUSTOM_MODEL`、`CUSTOM_API_KEY` | `gemma-3-27b-it` |

- `AI_PROVIDER` 指定伺服器預設（`anthropic` / `gpt` / `gemini` / `custom`），未設定則取第一個有金鑰的
- **自訂 Endpoint** 走 OpenAI 相容 API（`{CUSTOM_BASE_URL}/chat/completions`），之後要接手機/本機部署的 Gemma（llama.cpp、Ollama、vLLM 等）只要填 URL 和模型名即可；考量本機模型多半不支援 structured output，這條路徑改用 prompt 要求 JSON + 容錯解析

## 快速開始

```bash
cp .env.example .env        # 至少填一組 AI provider 金鑰
npm install
npm run dev                 # http://localhost:3000
```

部署到 Vercel：import 這個 repo，在專案設定加上對應環境變數即可。

> PWA 安裝與 Web Share Target 需要 HTTPS（Vercel 預設就有）。

## 架構

```
截圖分享/上傳 ──► 前端縮圖壓縮 ──► POST /api/analyze
                                     │  Claude (claude-opus-4-8) Vision
                                     │  + structured output（JSON Schema）
                                     ▼
                             確認/編輯畫面 ──► GET /api/geocode（Nominatim 地址轉座標）
                                     ▼
                             localStorage 收藏 ──► 名單 / 隨機推薦（地圖暫下架）
```

| 路徑 | 說明 |
|---|---|
| `app/api/analyze/route.ts` | 截圖分析入口，依 provider 分派 |
| `lib/ai-providers.ts` | 四種 AI provider 實作（Anthropic structured output / OpenAI json_schema / Gemini JSON mode / 自訂 OpenAI 相容） |
| `app/api/providers/route.ts` | 回傳已設定的 provider 清單給設定畫面 |
| `app/api/geocode/route.ts` | 地址 → 座標（OpenStreetMap Nominatim 代理，含快取） |
| `app/api/place-search/route.ts` | 店名 → 地址+座標（有 `GOOGLE_MAPS_API_KEY` 走 Google Places，否則 Nominatim） |
| `app/api/nearby/route.ts` | 座標 → 附近餐廳清單（Google Places Nearby / OSM Overpass） |
| `components/RandomSheet.tsx` | 隨機推薦：口袋/附近雙來源 + 骰子動畫 + 遺珠清單 |
| `components/DiceRoll.tsx` | 全屏 2 秒骰子滾動動畫 |
| `lib/geo.ts` | 取得定位（Capacitor 原生 / 瀏覽器，失敗退回台北） |
| `lib/store.ts` | localStorage 收藏 CRUD、匯出/匯入、Google Maps 連結產生 |
| `lib/google-drive.ts` | Google Drive 備份/還原（GIS token + appDataFolder，純前端） |
| `components/AnalyzeSheet.tsx` | 分析中 → 確認編輯 → 儲存 的流程 |
| `components/RandomSheet.tsx` | 隨機推薦（可依料理類型篩選） |
| `components/EditSheet.tsx` | 手動新增 / 編輯收藏（共用表單，地址變更會重新地理編碼） |
| `components/MapView.tsx` | 地圖接口（暫未掛載，未來改 Google Maps API 時替換內部實作） |
| `public/sw.js` | Service worker：PWA 安裝 + 接收分享的截圖 |
| `public/manifest.webmanifest` | PWA 設定：主畫面捷徑、share_target |
| `capacitor.config.ts` | Capacitor 設定：Android 殼載入線上網址（`server.url`） |
| `lib/widget-sync.ts` | 在 Capacitor 殼內把口袋名單同步給原生 widget（瀏覽器環境 no-op） |
| `android/` | Android 原生殼 + 兩個主畫面 widget（見下方） |

## Android 原生殼 + Widget

Capacitor 殼，WebView 直接載入 `https://local-food-collection.vercel.app`（網頁更新不用重發 App）。

- **🎲 吃什麼（1×1 按鈕）**：`DiceWidgetProvider`，點了開 App 並直接彈出隨機推薦（`?random=1`）
- **隨機餐廳卡片（4×2）**：`RandomFoodWidgetProvider`，直接顯示一家口袋餐廳，可「換一家」、開 Google Maps 導航、點卡片開 App

資料流：`lib/store.ts` 每次寫入（+ App 開啟時）→ `lib/widget-sync.ts` 呼叫原生 `WidgetSyncPlugin` → SharedPreferences → widget 重繪。widget 資料來源是**殼內 WebView 的 localStorage**，與 Chrome/PWA 的收藏是分開的。

```bash
npx cap sync android                          # 改過 capacitor.config.ts 後同步
cd android && ./gradlew assembleDebug        # 或用 Android Studio 開 android/ 資料夾
adb install app/build/outputs/apk/debug/app-debug.apk
```

> Gradle 建置需 JDK 17–21（系統 Java 25 太新，可用 Android Studio 內建 JBR：設 `JAVA_HOME` 指向 `Android Studio/jbr`）。

## Roadmap

- [x] **真正的主畫面 widget（Android）**：Capacitor 殼 + RemoteViews widget（見上）
- [ ] **iOS widget**：需 WidgetKit；過渡方案：iOS 可用「捷徑」App 建一個開啟 `https://你的網址/?random=1` 的捷徑放主畫面
- [ ] **iOS 分享截圖進 App**：用「捷徑」建立分享表單捷徑，把圖片 POST 到 `/api/analyze`
- [ ] **跨裝置同步**：接 Supabase（Auth + Postgres + Storage），取代 localStorage
- [ ] 依目前位置排序／「附近的口袋名單」推薦
- [ ] 已吃過 / 想吃 狀態與評分

## 注意事項

- Nominatim 為免費服務，僅適合個人低流量使用；正式產品請換 Google Geocoding 或 Mapbox
- 截圖僅在分析當下傳給 Claude API，不會被儲存在伺服器
