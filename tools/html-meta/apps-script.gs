/**
 * html-meta 客戶回傳資料接收器（Google Apps Script）
 * ------------------------------------------------------------
 * 設定步驟：
 * 1. 新建一個 Google 試算表 → 選單「擴充功能 → Apps Script」
 * 2. 把這整份程式碼貼進 Code.gs（覆蓋原本內容）→ 儲存
 * 3. 右上「部署 → 新增部署作業」→ 類型選「網頁應用程式」
 *      執行身分：我
 *      存取權：任何人
 *    → 部署，第一次會要求授權（選自己的帳號 → 進階 → 前往）
 * 4. 複製「網頁應用程式網址」(…/exec)，貼到 index.html 的 SUBMIT_ENDPOINT
 * 5. 之後改程式碼要「部署 → 管理部署作業 → 編輯 → 版本選新版本」，網址才不會變
 *
 * 資料會寫進試算表的「回傳紀錄」分頁（沒有會自動建立）。
 * ------------------------------------------------------------
 */

const SHEET_NAME      = '回傳紀錄';
const NOTIFY_EMAIL    = '';      // 想收到新資料通知就填信箱，例如 'you@example.com'；空白 = 不寄
const MAX_BODY        = 10000;   // 整包資料上限（字元）
const MAX_FIELD       = 1000;    // 單一欄位上限（字元）
const MIN_ELAPSED_MS  = 3000;    // 開頁不到 3 秒就送出 → 視為機器人
const IP_LIMIT        = 5;       // 同一 IP 每 10 分鐘最多 5 筆
const IP_WINDOW_SEC   = 600;
const GLOBAL_LIMIT    = 100;     // 全部加總每小時最多 100 筆（防灌爆）
const DUP_WINDOW_SEC  = 3600;    // 相同內容 1 小時內只記一次

const FIELDS = [
  ['src', '網站網址'], ['title', 'Title'], ['description', '描述'], ['keyword', '關鍵字'],
  ['address', '地址'], ['phone', '電話'], ['fb', 'FB'], ['gmap', 'GMAP'], ['email', '收名單信箱']
];

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > MAX_BODY) return out_(false, '資料格式錯誤');

    let d;
    try { d = JSON.parse(raw); } catch (_) { return out_(false, '資料格式錯誤'); }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return out_(false, '資料格式錯誤');

    // 機器人：蜜罐欄位有值、或開頁秒送 → 假裝成功，不寫入
    if (d.hp) return out_(true, 'ok');
    if (!(Number(d.elapsed) >= MIN_ELAPSED_MS)) return out_(true, 'ok');

    const values = FIELDS.map(([k]) => clean_(d[k]));
    if (!values[1]) return out_(false, '缺少 Title');

    const ip = String(d.ip || '').slice(0, 45).replace(/[^0-9a-fA-F:.]/g, '') || '未知';
    const ua = clean_(d.ua).slice(0, 200);
    const hash = digest_(values.join('\u0001'));

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return out_(false, '系統忙碌，請稍後再試');
    try {
      const cache = CacheService.getScriptCache();

      if (cache.get('dup:' + hash)) return out_(true, 'ok', { dup: true });
      if (!hit_(cache, 'g', GLOBAL_LIMIT, 3600)) return out_(false, '系統忙碌，請稍後再試');
      if (!hit_(cache, 'ip:' + ip, IP_LIMIT, IP_WINDOW_SEC)) return out_(false, '送出太頻繁，請 10 分鐘後再試');

      const now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
      getSheet_().appendRow([now, ip].concat(values, [ua]));
      cache.put('dup:' + hash, '1', DUP_WINDOW_SEC);
    } finally {
      lock.releaseLock();
    }

    if (NOTIFY_EMAIL) notify_(values, ip);
    return out_(true, 'ok');
  } catch (err) {
    console.error(err);
    return out_(false, '伺服器錯誤');
  }
}

function doGet() {
  return out_(true, 'html-meta receiver is running');
}

/* ---------- 工具函式 ---------- */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['送出時間', 'IP'].concat(FIELDS.map(f => f[1]), ['瀏覽器']));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, FIELDS.length + 3).setFontWeight('bold');
  }
  return sh;
}

// 清理欄位：限長度、去控制字元、防試算表公式注入（= + - @ 開頭加 '）
function clean_(v) {
  let s = String(v == null ? '' : v).slice(0, MAX_FIELD).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

// 簡易計數限流：回傳 false 代表超過上限
function hit_(cache, key, limit, windowSec) {
  const n = Number(cache.get('rl:' + key) || 0);
  if (n >= limit) return false;
  cache.put('rl:' + key, String(n + 1), windowSec);
  return true;
}

function digest_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function notify_(values, ip) {
  try {
    const body = FIELDS.map(([, label], i) => `${label}：${values[i]}`).join('\n') + `\n\nIP：${ip}`;
    MailApp.sendEmail(NOTIFY_EMAIL, `[網站基本資料回傳] ${values[1]}`, body);
  } catch (err) {
    console.error('notify failed', err);
  }
}

function out_(ok, msg, extra) {
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({ ok: ok, msg: msg }, extra || {})))
    .setMimeType(ContentService.MimeType.JSON);
}
