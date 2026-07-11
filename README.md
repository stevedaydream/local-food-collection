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
- ☁️ **Google Drive 備份（免設定）**：⚙️ 設定內一鍵備份 / 還原——備份存在使用者自己 Drive 的隱藏應用程式空間（`drive.appdata` scope，App 碰不到其他檔案）；開發者只需設定一次 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`（見 `.env.example`），使用者只要選 Google 帳號。還原採合併（依 id 去重），換新機直接還原即可。Android 殼內走原生 Google 授權（見下方 Android 章節）

## 帳號與雲端同步（Supabase，Phase 1）

⚙️ 設定 →「👤 帳號與雲端同步」用 Google 登入後，收藏自動同步到 Supabase（東京區）：

- 登入：瀏覽器走 GIS 官方按鈕取 ID token；Android 殼走 Credential Manager 原生流程（`GoogleAuthPlugin.getIdToken`）；兩邊都用 `supabase.auth.signInWithIdToken` 換 session
- 同步：開頁時 pull 合併（同 id 以雲端為準、「曾同步過但雲端已刪」不復活）；每次本機寫入 debounce 2 秒全量 push（upsert + 刪多餘列）；未登入/離線自動降級純 localStorage
- Schema：`profiles` + `restaurants`（owner-only RLS；`visibility` 欄位已預留 Phase 2 朋友分享）
- 開發者設定：`.env.example` 的 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`，並在 Supabase Dashboard → Authentication → Google provider 啟用 + 把 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 加進 Client IDs
### 朋友分享（Phase 2）

- 主畫面右上 **👥** → 產生邀請連結（7 天有效）傳給朋友；對方登入後點開自動成為好友（未登入會先引導登入、登入完自動補加）
- 收藏在編輯表單勾「**👥 分享給朋友**」才會被好友看到（含備註與縮圖；預設全部私人），卡片會標「👥 已分享」
- 好友清單可「📋 看清單」瀏覽對方分享的收藏、📍 導航、「➕ 收藏」複製進自己名單（以店名+地址判斷已收藏過）
- 後端：`invites` / `friendships`（單列 `user_a<user_b`）；加好友只能走 `accept_invite` RPC（SECURITY DEFINER，advisors 對它的警告屬預期）；`restaurants` 追加「朋友可讀 visibility='friends'」的 RLS policy

### 公共美食庫（Phase 3）

- **opt-in 貢獻**：⚙️ 設定 →「🌍 公共美食庫」→「貢獻我的清單」，按下時彈出同意聲明——只上傳客觀欄位（店名、地址、地區、類型、推薦菜色、價位、座標），**備註、截圖、收藏來源絕不上傳**；「撤回全部」會連已收錄進公共庫的列一起刪（`revoke_my_contributions` RPC）
- **審核台（Google Sheet + GAS）**：`scripts/gas-review.gs` 貼進 Sheet 的 Apps Script，指令碼屬性設 `SERVICE_ROLE_KEY`（僅放 GAS，勿進前端）→ 選單「⬇️ 拉取待審核」→ 審核欄選 通過/拒絕 →「⬆️ 送出」；通過走 `review_contribution` RPC 寫入 `public_places`（同店名+地址自動去重）
- **回饋使用者**：「📍 附近」隨機推薦會把 1.5km 內的公共庫店家併入候選（與地圖來源同名去重），不用登入也吃得到
- 資料表：`public_contributions`（貢獻者本人 RLS）＋ `public_places`（全員可讀、只有審核 RPC 能寫）

Roadmap：資料量大後可換 PostGIS 半徑查詢、公共庫瀏覽頁

## AI 引擎（四種可選）

分析引擎可透過環境變數設定，**至少設定一組**；設定多組時可在 App 內 ⚙️ 切換：

| Provider | 必要環境變數 | 選用 | 預設模型 |
|---|---|---|---|
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-opus-4-8` |
| GPT (OpenAI) | `OPENAI_API_KEY` | `OPENAI_MODEL`、`OPENAI_BASE_URL` | `gpt-4o` |
| Gemini (Google) | `GEMINI_API_KEY` | `GEMINI_MODEL` | `gemini-2.5-flash` |
| 自訂 Endpoint | `CUSTOM_BASE_URL` | `CUSTOM_MODEL`、`CUSTOM_API_KEY` | `gemma-3-27b-it` |

- `AI_PROVIDER` 指定伺服器預設（`anthropic` / `gpt` / `gemini` / `custom`），未設定則取第一個有金鑰的
- **自訂 Endpoint** 走 OpenAI 相容 API（`{CUSTOM_BASE_URL}/chat/completions`），適合接自架的推論服務；考量本機模型多半不支援 structured output，這條路徑改用 prompt 要求 JSON + 容錯解析

### 📱 本機模式（第五種：瀏覽器直連，截圖不上雲）

除了上面四種「伺服器端」引擎，App 內建**本機模式**：瀏覽器直接連你裝置上的
OpenAI 相容模型伺服器（Ollama / LM Studio / llama.cpp / Termux+Ollama 等），截圖完全不離開裝置。

- 到 App 右上角 ⚙️ → 「本機模式」→ 跟著三步驟教學精靈設置（內建 Ollama / LM Studio / llama.cpp / Android 手機範本、CORS 指令、連線測試）
- 模型需支援 vision（例如 `gemma3:12b`、手機用 `gemma3:4b`）
- **HTTPS 限制**：本站是 HTTPS，瀏覽器只允許直連 `localhost`（模型跑在同一台裝置）；要連區網其他機器請用 Tailscale（`tailscale serve`）或 ngrok 提供 https:// 網址——設置畫面會自動偵測並提示
- 常見 CORS 設定：Ollama 用 `OLLAMA_ORIGINS="*" ollama serve`；LM Studio 開啟 Enable CORS；llama.cpp 預設即允許

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
| `lib/ai-providers.ts` | 伺服器端四種 provider 實作（Anthropic structured output / OpenAI json_schema / Gemini JSON mode / 自訂 OpenAI 相容） |
| `lib/analyze-shared.ts` | 前後端共用：prompt、JSON schema、容錯解析、OpenAI 相容 request 組裝 |
| `lib/local-mode.ts` | 本機模式：瀏覽器直連本機模型、連線測試、混合內容偵測 |
| `components/LocalSetupSheet.tsx` | 本機模式三步驟教學精靈（範本 + CORS 指令 + 連線測試） |
| `app/api/providers/route.ts` | 回傳已設定的 provider 清單給設定畫面 |
| `app/api/geocode/route.ts` | 地址 → 座標（OpenStreetMap Nominatim 代理，含快取） |
| `app/api/place-search/route.ts` | 店名 → 地址+座標（有 `GOOGLE_MAPS_API_KEY` 走 Google Places，否則 Nominatim） |
| `app/api/nearby/route.ts` | 座標 → 附近餐廳清單（Google Places Nearby / OSM Overpass） |
| `components/RandomSheet.tsx` | 隨機推薦：口袋/附近雙來源 + 骰子動畫 + 遺珠清單 |
| `components/DiceRoll.tsx` | 全屏 2 秒骰子滾動動畫 |
| `lib/geo.ts` | 取得定位（Capacitor 原生 / 瀏覽器，失敗退回台北） |
| `lib/store.ts` | localStorage 收藏 CRUD、匯出/匯入、Google Maps 連結產生 |
| `lib/google-drive.ts` | Google Drive 備份/還原（appDataFolder；瀏覽器走 GIS、殼內走原生授權） |
| `lib/native-share.ts` | 殼內接收原生分享的截圖（ShareReceiverPlugin → Blob） |
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

資料流：`lib/store.ts` 每次寫入（+ App 開啟時）→ `lib/widget-sync.ts` 呼叫原生 `WidgetSyncPlugin` → SharedPreferences → widget 重繪。widget 資料來源是**殼內 WebView 的 localStorage**，與 Chrome/PWA 的收藏是分開的（可用 Google Drive 備份/還原或 JSON 匯出/匯入互通）。

### 殼內接收分享截圖（原生 ACTION_SEND）

PWA 的 Web Share Target 只對 Chrome 安裝的 PWA 生效；殼 App 另外用原生 intent-filter 接收：
任何 App 截圖 → 分享 → 選「口袋美食地圖」→ `MainActivity` 讀圖存進 `ShareReceiverPlugin` →
WebView 載入 `/?share-native=1` → 網頁端（`lib/native-share.ts`）取圖直接進 AI 分析流程。

### 殼內 Google Drive 備份（原生授權）

Google 擋 WebView 內的 OAuth（`disallowed_useragent`），殼內改走 Play Services 的
AuthorizationClient 原生流程（`GoogleAuthPlugin`）取 access token，再交給 `lib/google-drive.ts`
打同一套 Drive REST。**開發者需在 Google Cloud Console 多註冊一個「Android」類型的 OAuth
client**（同一個專案）：package name 填 `com.stevedaydream.localfood`，SHA-1 用
`cd android && ./gradlew signingReport` 查（debug 與 release 簽章各註冊一個）。不需要任何金鑰或
google-services.json，Google 是靠 package + 簽章比對放行。

```bash
npx cap sync android                          # 改過 capacitor.config.ts 後同步
cd android && ./gradlew assembleDebug        # 或用 Android Studio 開 android/ 資料夾
adb install app/build/outputs/apk/debug/app-debug.apk
```

> Gradle 建置需 JDK 17–21（系統 Java 25 太新，可用 Android Studio 內建 JBR：設 `JAVA_HOME` 指向 `Android Studio/jbr`）。

### Release 與 App 內自動更新

發版：跑專案根目錄的 **`release.bat`** → 輸入新版號 → 自動改 `versionName`/`versionCode`、
commit、上 tag `v*`、push → GitHub Actions（`.github/workflows/release-android.yml`）建
release APK 並掛上 GitHub Release。

App 內自動更新：殼開啟時（`lib/app-update.ts`，每天最多查一次）比對 APK 版本與 GitHub Releases
最新 tag，有新版跳確認 → 系統瀏覽器直接下載 APK 安裝（`AppUpdatePlugin`）。瀏覽器 / PWA 不受影響，
網頁本身跟著 Vercel 部署走。

CI 簽章需在 GitHub repo → Settings → Secrets and variables → Actions 設定：
`ANDROID_KEYSTORE_BASE64`（keystore 檔 base64）、`ANDROID_KEYSTORE_PASSWORD`、
`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`（選填，預設同 store 密碼）。
**簽章要跟手機上已安裝版本一致**才能覆蓋安裝，且 SHA-1 要註冊在 Google 的 Android OAuth client
（Drive 備份用）——換 keystore 就要重新註冊 SHA-1 並重裝 App。

## Roadmap

- [x] **真正的主畫面 widget（Android）**：Capacitor 殼 + RemoteViews widget（見上）
- [ ] **iOS widget**：需 WidgetKit；過渡方案：iOS 可用「捷徑」App 建一個開啟 `https://你的網址/?random=1` 的捷徑放主畫面
- [ ] **iOS 分享截圖進 App**：用「捷徑」建立分享表單捷徑，把圖片 POST 到 `/api/analyze`
- [x] **跨裝置同步**：Supabase Auth（Google 登入）+ Postgres 同步（見「帳號與雲端同步」）
- [x] **朋友分享（Phase 2）**：邀請連結加好友、互看分享清單（見「帳號與雲端同步」）
- [x] **公共美食庫（Phase 3）**：opt-in 貢獻 + Google Sheet 人工審核台（見「帳號與雲端同步」）
- [ ] 依目前位置排序／「附近的口袋名單」推薦
- [ ] 已吃過 / 想吃 狀態與評分

## 注意事項

- Nominatim 為免費服務，僅適合個人低流量使用；正式產品請換 Google Geocoding 或 Mapbox
- 截圖僅在分析當下傳給 Claude API，不會被儲存在伺服器
