# 🍜 口袋美食地圖 local-food-collection

在 IG / Threads / 小紅書看到好吃的餐廳，截圖存了就忘在哪？
這個 App 讓你把截圖**分享進來 → AI 自動分析歸檔 → 不知道吃什麼時一鍵隨機推薦**。

## 功能

- 📸 **截圖 AI 分析**：上傳（或從分享選單傳入）社群貼文截圖，Claude Vision 自動抽出店名、地址、料理類型、推薦菜色、來源平台與備註，一張截圖可辨識多家餐廳（清單型貼文也 OK）
- 📷 **拍照記錄（招牌照 → 店家資料）**：底部「📸 拍照/截圖」→「拍店家招牌」，直接開後鏡頭拍下招牌就自動辨識
  - 位置：現拍用即時 GPS；相簿舊照先讀**照片本身的 EXIF GPS**（`lib/exif.ts`，canvas 壓縮會把 EXIF 丟掉所以在壓縮前讀），讀不到才退回目前位置並明講
  - 辨識：AI 讀招牌文字（順便抽菜色／價位／營業時間）→ 程式用座標查附近店家清單（由近到遠）→ **清單連同照片一起交給 AI 指認是哪一家**
  - 確認：自動填上對照到的正式店名／地址／座標／Google 連結並標「✅ 已對照地圖」，下方候選 chip 可整組換一家，或「都不是，用招牌文字」
  - 相簿選到的圖有 GPS 就走這條路、沒有就當社群截圖（截圖不會有 GPS），分享進來的圖也一樣自動判斷
- ✅ **儲存前確認**：AI 結果可先編輯、勾選要收藏哪幾家；信心較低的欄位會標示「建議核對」
- 📋 **口袋名單**：卡片列表 + 料理類型標籤，附截圖縮圖；卡片**左滑可編輯或刪除**
- ✏️ **手動新增**：沒有截圖也能直接輸入店名、地址等資訊收藏；店名旁「🔍 找地址」可搜尋地圖自動帶入正確地址與導航位置（設 `GOOGLE_MAPS_API_KEY` 走 Google Places，未設定退回 Nominatim）
- 🔗 **貼上就自動填好（`/api/resolve-place`）**：新增表單最上面的欄位兩個方向都吃——
  - **貼地址** → 找出店名、正式地址、座標與 Google 地圖連結
  - **貼 Google 地圖連結**（含 `maps.app.goo.gl` 短網址，會先展開）→ 抓店名、地址、座標
  - 存下來的 Google 連結會讓卡片與 widget 的「導航」直接開那家店的地圖頁（不是只掉一根座標針）
  - Android：Google 地圖 →「分享」→ 口袋美食地圖，表單會自動解析；瀏覽器 PWA 也吃分享進來的連結（share_target 的 text/url）
- 🗺️ 地圖檢視暫時下架（`components/MapView.tsx` 保留為接口，未來改接 Google Maps API；地理編碼 `/api/geocode` 照常運作）
- 🎲 **吃什麼？**：2 秒全屏骰子動畫後隨機推薦，顯示店名 + 地址 + 距離 + Google Maps 導航連結，並列出沒被骰到的其他候選；可按類型篩選、不滿意就「換一家」
  - **🌏 只推你去得了的**：「🍜 我的名單」只骰**你目前所在國家**的收藏（人在日本就不會推台灣的店），並按距離排序。本國收藏少於 5 家時自動混入附近店家，卡片標示「🍜 口袋 / 📍 附近 / 🌐 公共庫」來源，口袋收藏權重 ×3
    - 國家判定：先查離線座標範圍表（`lib/country-bbox.ts`，零 API、可離線），落在表外才打一次反查
    - 沒座標的收藏算不出國家，不進骰盅但會提示「N 家沒有位置資訊」，可一鍵補座標
  - **📍 附近模式**：口袋名單空空（或主動切換）時搜尋附近餐廳來骰——設 `GOOGLE_MAPS_API_KEY` 走 Google Places Nearby（含評分），未設定退回 OSM Overpass
- 📍 **標題列顯示所在地**：`📍 日本 東京都 荒川區`。已授權過才自動定位（不主動彈權限），點一下可**重新定位 / 手動指定 / 回自動**
  - 定位失敗**不再退回台北**（那會讓人在日本卻被判成在台灣），改用上次成功的位置並標示「上次位置」
  - 手動指定一直有效，但 GPS 判定你已在別的國家時自動解除
  - 快取：定位 5 分鐘、附近搜尋 10 分鐘，移動超過 500m 才重查
- 🔎 **條件篩選**：名單可依 來源（IG/FB…）× 地區 × 類型（早午餐、火鍋…）快速過濾，分類欄位在編輯表單都能補
  - **地區分兩層**：一級（台北市／東京都）選了才出現二級（信義區／荒川區）；二級非必填，不選＝該一級底下全部。一級選單依**目前所在國家**分組（你在日本時日本的縣市排最前面，其他國家收在「其他國家」分組）
  - **📍 這附近**：一顆 toggle，只看目前所在國家的收藏並按距離排序，卡片上直接標距離（還沒定位時按了會開位置面板）
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
  - 想讓後加的欄位也跨裝置同步，在 Supabase 跑一次：
    ```sql
    alter table restaurants add column if not exists google_url   text;
    alter table restaurants add column if not exists district     text;
    alter table restaurants add column if not exists country      text;
    alter table restaurants add column if not exists country_code text;
    ```
    沒跑也不會壞：`lib/cloud-sync.ts` 撞到缺欄位會自動改推不含這些欄的資料，值留在本機
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
| `lib/analyze-shared.ts` | 前後端共用：截圖／拍照兩套 prompt 與 schema（`buildPrompt`）、容錯解析、OpenAI 相容 request 組裝 |
| `lib/exif.ts` | 從 JPEG 的 EXIF 讀拍照座標（自己解 APP1/TIFF，無套件依賴） |
| `lib/local-mode.ts` | 本機模式：瀏覽器直連本機模型、連線測試、混合內容偵測 |
| `components/LocalSetupSheet.tsx` | 本機模式三步驟教學精靈（範本 + CORS 指令 + 連線測試） |
| `app/api/providers/route.ts` | 回傳已設定的 provider 清單給設定畫面 |
| `app/api/geocode/route.ts` | 地址 → 座標（OpenStreetMap Nominatim 代理，含快取） |
| `app/api/place-search/route.ts` | 店名 → 地址+座標（有 `GOOGLE_MAPS_API_KEY` 走 Google Places，否則 Nominatim） |
| `app/api/resolve-place/route.ts` | 萬用解析：貼地址 → 店名/連結、貼 Google 連結 → 店名/地址（短網址先展開，連鎖店用座標框限制範圍） |
| `lib/place-url.ts` | 純函式：Google 地圖網址解析（店名/座標/place_id）、台灣地址推縣市、產生地圖連結 |
| `app/api/nearby/route.ts` | 座標 → 附近餐廳清單（Google Places Nearby / OSM Overpass；Overpass 一定要帶 `User-Agent` + `Accept`，少一個就回 406） |
| `app/api/reverse-geocode/route.ts` | 座標 → 國家 / 縣市 / 行政區（Nominatim reverse 代理） |
| `lib/reverse-geo.ts` | 反查欄位對應：Nominatim 各國欄位不統一，東京 23 區沒有 province，靠 ISO3166-2 補「東京都」 |
| `lib/country-bbox.ts` | 離線座標→國家判定表（面積小的先比對，港澳贏中國）+ 距離計算 |
| `lib/location.ts` | 目前位置的單一來源：定位 / 反查 / 快取 / 手動指定與自動解除 |
| `components/LocationPanel.tsx` | 標題列 📍 點開的位置面板（重新定位 / 手動指定 / 回自動） |
| `components/RandomSheet.tsx` | 隨機推薦：口袋/附近雙來源 + 骰子動畫 + 遺珠清單 |
| `components/DiceRoll.tsx` | 全屏 2 秒骰子滾動動畫 |
| `lib/geo.ts` | 取得定位（Capacitor 原生 / 瀏覽器，失敗退回台北） |
| `lib/store.ts` | localStorage 收藏 CRUD、匯出/匯入、Google Maps 連結產生 |
| `lib/google-drive.ts` | Google Drive 備份/還原（appDataFolder；瀏覽器走 GIS、殼內走原生授權） |
| `lib/native-share.ts` | 殼內接收原生分享的截圖（ShareReceiverPlugin → Blob） |
| `components/AnalyzeSheet.tsx` | 分析中 → 確認編輯 → 儲存 的流程 |
| `components/RandomSheet.tsx` | 隨機推薦（可依料理類型篩選） |
| `components/EditSheet.tsx` | 手動新增 / 編輯收藏（共用表單，最上面可貼地址或 Google 連結自動填入，地址變更會重新地理編碼） |
| `components/MapView.tsx` | 地圖接口（暫未掛載，未來改 Google Maps API 時替換內部實作） |
| `public/sw.js` | Service worker：PWA 安裝 + 接收分享的截圖 |
| `public/manifest.webmanifest` | PWA 設定：主畫面捷徑、share_target |
| `capacitor.config.ts` | Capacitor 設定：Android 殼載入線上網址（`server.url`） |
| `lib/widget-sync.ts` | 在 Capacitor 殼內把口袋名單與目前位置同步給原生 widget（瀏覽器環境 no-op） |
| `android/` | Android 原生殼 + 兩個主畫面 widget（見下方） |

## Android 原生殼 + Widget

Capacitor 殼，WebView 直接載入 `https://local-food-collection.vercel.app`（網頁更新不用重發 App）。

- **🎲 吃什麼（1×1 按鈕）**：`DiceWidgetProvider`，點了開 App 並直接彈出隨機推薦（`?random=1`）
- **隨機餐廳卡片（4×2）**：`RandomFoodWidgetProvider`，直接顯示一家口袋餐廳，可「換一家」、開 Google Maps 導航、點卡片開 App

#### widget 選區域

卡片右上角的 **📍 標籤**（或新增 widget 時 launcher 跳出的設定畫面）可以**分兩層**選這張卡片要抽哪裡：
先選縣市，該縣市底下有行政區就再讓你選一層（可選「整個 ○○」＝只鎖一級），存成 `縣市|行政區`。
所以可以並排放「台北」「汐止區」兩張卡片各自骰。設定畫面點一下就生效（返回鍵離開也算數）。另有一項 **📍 跟著我的位置**：自動跟著你目前所在的
一級行政區（在東京就等於選了東京都），那一級沒有收藏就放寬到同國家，標籤顯示「📍 東京都（自動）」。

widget 自己抓 GPS 需要背景定位權限，所以位置是由 App 每次成功定位時經
`WidgetSync.syncLocation` 推進 SharedPreferences；同步名單時也會順便補好每筆的 `countryCode`
（原生端沒有座標→國家對照表，統一在 `lib/widget-sync.ts` 算好再送）。實作：

- `WidgetConfigActivity`：`widget_random_food_info.xml` 的 `android:configure`，選項是名單裡出現過的 `city` +「全部區域」，各項附家數
- `widget_random_food_info.xml` 帶 `widgetFeatures="reconfigurable|configuration_optional"`：Android 12+ 新增時不強迫設定（預設全部），之後隨時點 📍 改
- 「跟著我的位置」由細到粗退讓：**所在行政區 → 縣市 → 同國家 → 全部**，標籤顯示實際跟到的那一層
- `lib/place-url.ts` 的 `splitCityDistrict()`：舊資料的 `city` 常把兩層黏在一起（舊 AI prompt 的範例就是「台北 大安區」），
  存檔前會拆成 `city` + `district`，⚙️ 設定的「補齊地區資料」也會把既有資料就地拆開，widget 才分得開兩層
- `WidgetData`：區域與「目前抽到哪一家」都存成 per `appWidgetId`（`region_<id>` / `current_restaurant_id_<id>`），widget 移除時 `onDeleted` 清掉；每張卡片的 PendingIntent request code 也依 id 分開，換一家只動被點的那張
- 該區域沒有收藏時卡片顯示「這個區域還沒有收藏」，📍 仍可點回別區

資料流：`lib/store.ts` 每次寫入（+ App 開啟時）→ `lib/widget-sync.ts` 呼叫原生 `WidgetSyncPlugin` → SharedPreferences → widget 重繪。widget 資料來源是**殼內 WebView 的 localStorage**，與 Chrome/PWA 的收藏是分開的（可用 Google Drive 備份/還原或 JSON 匯出/匯入互通）。

### 殼內接收分享的截圖與連結（原生 ACTION_SEND）

PWA 的 Web Share Target 只對 Chrome 安裝的 PWA 生效；殼 App 另外用原生 intent-filter 接收：

- **`image/*`**：任何 App 截圖 → 分享 → 選「口袋美食地圖」→ `MainActivity` 讀圖存進 `ShareReceiverPlugin` →
  WebView 載入 `/?share-native=1` → 網頁端（`lib/native-share.ts`）取圖直接進 AI 分析流程
- **`text/plain`**：Google 地圖 → 分享 → 口袋美食地圖 → 文字存進 `ShareReceiverPlugin.pendingText` →
  `/?share-text=1` → 開新增表單自動呼叫 `/api/resolve-place` 解析（瀏覽器 PWA 走 `public/sw.js`
  把分享的文字暫存到 cache，同樣導到 `/?share-text=1`）

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
