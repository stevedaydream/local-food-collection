/**
 * 口袋美食地圖 — 公共美食庫審核台（Google Apps Script）
 *
 * 設置步驟：
 * 1. 開一個新的 Google Sheet → 擴充功能 → Apps Script → 貼上本檔全部內容
 * 2. Apps Script 左側「專案設定」→ 指令碼屬性 加一筆：
 *      SERVICE_ROLE_KEY = <Supabase Dashboard → Settings → API keys 的 service_role key>
 *    （service_role 可繞過 RLS，只放在 GAS 這種伺服器端環境，絕不要放進前端）
 * 3. 回到 Sheet 重新整理 → 上方會出現「🍜 審核台」選單
 *
 * 使用流程：
 *   「⬇️ 拉取待審核」→ 逐列在「審核」欄填 通過 / 拒絕 →「⬆️ 送出審核結果」
 *   通過的會寫進 public_places（App 的「📍 附近」推薦會撈到），並自動去重（同店名+地址）。
 */

var SUPABASE_URL = 'https://izykojbkjgghzqfzufhu.supabase.co';
var SHEET_NAME = '待審核';
var HEADERS = ['id', '店名', '地址', '地區', '類型', '推薦菜色', '價位', 'lat', 'lng', '送出時間', '審核'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🍜 審核台')
    .addItem('⬇️ 拉取待審核', 'pullPending')
    .addItem('⬆️ 送出審核結果', 'submitReviews')
    .addToUi();
}

function serviceKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('SERVICE_ROLE_KEY');
  if (!key) throw new Error('請先在 指令碼屬性 設定 SERVICE_ROLE_KEY');
  return key;
}

function supabaseFetch_(path, options) {
  var key = serviceKey_();
  options = options || {};
  options.headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  };
  options.muteHttpExceptions = true;
  var res = UrlFetchApp.fetch(SUPABASE_URL + path, options);
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase ' + res.getResponseCode() + ': ' + res.getContentText());
  }
  var text = res.getContentText();
  return text ? JSON.parse(text) : null;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  return sheet;
}

/** 把 status=pending 的貢獻列進 Sheet */
function pullPending() {
  var rows = supabaseFetch_(
    '/rest/v1/public_contributions?status=eq.pending&order=created_at.asc&select=*',
    { method: 'get' }
  );
  var sheet = getSheet_();
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  if (!rows || !rows.length) {
    SpreadsheetApp.getUi().alert('目前沒有待審核的貢獻 🎉');
    return;
  }
  var values = rows.map(function (r) {
    return [
      r.id,
      r.name,
      r.address || '',
      r.city || '',
      r.cuisine || '',
      (r.dishes || []).join('、'),
      r.price_range || '',
      r.lat,
      r.lng,
      r.created_at,
      '', // 審核欄：填「通過」或「拒絕」
    ];
  });
  sheet.getRange(2, 1, values.length, HEADERS.length).setValues(values);
  // 審核欄下拉選單
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(['通過', '拒絕'], true).build();
  sheet.getRange(2, HEADERS.length, values.length, 1).setDataValidation(rule);
  sheet.autoResizeColumns(1, HEADERS.length);
  SpreadsheetApp.getUi().alert('已拉取 ' + values.length + ' 筆，請在「審核」欄選 通過/拒絕 後送出');
}

/** 把有填審核結果的列送回 Supabase（review_contribution RPC） */
function submitReviews() {
  var sheet = getSheet_();
  var data = sheet.getDataRange().getValues();
  var done = 0;
  for (var i = 1; i < data.length; i++) {
    var id = data[i][0];
    var verdict = String(data[i][HEADERS.length - 1]).trim();
    if (!id || (verdict !== '通過' && verdict !== '拒絕')) continue;
    supabaseFetch_('/rest/v1/rpc/review_contribution', {
      method: 'post',
      payload: JSON.stringify({ p_id: id, p_approve: verdict === '通過' }),
    });
    done++;
  }
  SpreadsheetApp.getUi().alert('已送出 ' + done + ' 筆審核結果');
  if (done) pullPending();
}
