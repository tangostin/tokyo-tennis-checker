const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// ==========================================
// 【テスト設定】
// true の間はダミーの空きデータを注入してメールの見た目を確認できます。
// 動作確認が取れ、本番稼動させる際は false にしてください。
const TEST_MODE = true;
// ==========================================

// 対象施設リスト（全13施設・特定コード反映版）
const TARGETS = [
  // --- テニス（人工芝） 種目コード: 1000_1030 ---
  { name: '日比谷公園（人工芝）', purpose: '1000_1030', park: '1000' },
  { name: '芝公園（人工芝）', purpose: '1000_1030', park: '1010' },
  { name: '猿江恩賜公園', purpose: '1000_1030', park: '1040' },
  { name: '木場公園', purpose: '1000_1030', park: '1060' },
  { name: '祖師谷公園', purpose: '1000_1030', park: '1070' },
  { name: '大島小松川公園（人工芝）', purpose: '1000_1030', park: '1160' },
  { name: '汐入公園（人工芝）', purpose: '1000_1030', park: '1170' },
  { name: '井の頭恩賜公園（人工芝）', purpose: '1000_1030', park: '1220' },
  { name: '大井ふ頭海浜公園B（人工芝）', purpose: '1000_1030', park: '1315' },
  { name: '有明テニスC人工芝コート', purpose: '1000_1030', park: '1360' },

  // --- テニス（ハード） 種目コード: 1000_1020 ---
  { name: '大井ふ頭海浜公園A（ハード）', purpose: '1000_1020', park: '1310' },
  { name: '大井ふ頭海浜公園B（ハード）', purpose: '1000_1020', park: '1315' },
  { name: '有明テニス屋外ハードコート', purpose: '1000_1020', park: '1350' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';

// 数値の日付 (20260609) を "2026/6/9" 形式に整形する関数（ゼロパディングなし）
function formatDate(dateNum) {
  if (!dateNum) return '';
  const str = String(dateNum);
  if (str.length !== 8) return str;
  const y = str.substring(0, 4);
  const m = parseInt(str.substring(4, 6), 10);
  const d = parseInt(str.substring(6, 8), 10);
  return `${y}/${m}/${d}`;
}

// 数値の時間 (900 や 1100) を "09:00" や "11:00" に整形する関数
function formatTime(timeNum) {
  if (timeNum === undefined || timeNum === null) return '';
  const str = String(timeNum).padStart(4, '0');
  return `${str.substring(0, 2)}:${str.substring(2, 4)}`;
}

(async () => {

  const browser = await chromium.launch({
    headless: true
  });

  const mailLines = [];
  let hasAnyVacant = false;

  // 「当月」を判定するための基準値（例: "202606"）を作成
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  for (const target of TARGETS) {

    console.log('OPEN ' + target.name);

    let pageReady = false;
    let page = null;
    let jsonText = null;

    for (let retry = 1; retry <= 3; retry++) {
      page = await browser.newPage();
      page.on('response', async (response) => {
        if (response.url().includes('rsvWOpeInstSrchVacantAjaxAction.do')) {
          try {
            jsonText = await response.text();
            console.log('JSON CAPTURED');
          } catch (e) {}
        }
      });

      await page.goto(SITE_URL, { waitUntil: 'networkidle' });
      console.log('TRY=' + retry);

      try {
        await page.waitForSelector('#purpose-home', { timeout: 10000 });
        console.log('FOUND PURPOSE');
        pageReady = true;
        break;
      } catch (e) {
        console.log('PURPOSE NOT FOUND');
        await page.close();
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    if (!pageReady) {
      console.log('SITE UNAVAILABLE - STOP CHECKING');
      break;
    }

    await page.selectOption('#purpose-home', target.purpose);
    console.log('PURPOSE SELECTED');
    await page.waitForTimeout(1000);

    await page.selectOption('#bname-home', target.park);
    console.log('PARK SELECTED');
    await page.waitForTimeout(1000);

    await page.click('#btn-go');
    console.log('SEARCH CLICKED');

    // 13施設を順に回るため、各検索の合間に少し長めのウェイトを入れています
    await page.waitForTimeout(10000);

    console.log(jsonText ? 'JSON OK' : 'JSON NG');

    const parkVacantLines = [];

    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        const items = Array.isArray(parsed) 
          ? parsed 
          : (parsed.vacantList || parsed.list || Object.values(parsed).find(Array.isArray) || []);

        for (const item of items) {
          if (item && item.alt === '空き') {
            
            // 当月かつ土日祝の判定
            const useDayStr = String(item.useDay || '');
            const dow = item.useDayOfWeek || ''; // 曜日 (例: "土", "日", "祝")
            
            const isCurrentMonth = useDayStr.startsWith(currentMonthStr);
            const isWeekendOrHoliday = dow.includes('土') || dow.includes('日') || dow.includes('祝');

            // 当月末までの土日祝のみを抽出
            if (isCurrentMonth && isWeekendOrHoliday) {
              const dateStr = formatDate(item.useDay);
              const startStr = formatTime(item.startTime);
              const endStr = formatTime(item.endTime);
              const count = item.vacantNum || '0';
              
              if (dateStr && startStr && endStr) {
                parkVacantLines.push(`${dateStr}（${dow}）${startStr}-${endStr}（${count}面）`);
              }
            }
          }
        }
      } catch (parseError) {
        console.log('JSON PARSE ERROR: ' + parseError.message);
      }
    }

    // テストモードかつ最初の公園の場合、ダミーデータを注入して表示テストを行う
    if (TEST_MODE && target.name === '日比谷公園（人工芝）') {
      parkVacantLines.push('2026/6/20（土）13:00-15:00（4面）');
      parkVacantLines.push('2026/6/20（土）15:00-17:00（2面）');
    }

    // 空きがある（またはテストデータがある）場合のみ、公園名と詳細をリストに追加
    if (parkVacantLines.length > 0) {
      mailLines.push(`【${target.name}】`);
      mailLines.push(parkVacantLines.join('\n'));
      mailLines.push(''); // 公園間の空行
      hasAnyVacant = true;
    }

    await page.close();
  }

  await browser.close();

  // 末尾にURLを追加
  mailLines.push(SITE_URL);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: 'テニスコート空き状況通知',
    text: mailLines.join('\n')
  });

  console.log('MAIL SENT');

})();
