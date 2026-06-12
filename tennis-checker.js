const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// ==========================================
// 【テスト設定】
// true の間はダミーの空きデータを注入してメールの見た目を確認できます。
// 動作確認が取れ、本番稼動させる際は false にしてください。
const TEST_MODE = false; 
// ==========================================

// 対象施設リスト（全13施設）
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

// 内閣府発表等の国民の祝日を自動判定するための関数
function isHoliday(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  
  // 祝日データを簡易的に網羅（振替休日や年によってズレる祝日は都度ここに足すか、主要な祝日を指定）
  // ※ 2026年の主要な祝日リスト
  const holidays2026 = [
    '2026-1-1',  // 元日
    '2026-1-12', // 成人の日
    '2026-2-11', // 建国記念の日
    '2026-2-23', // 天皇誕生日
    '2026-3-20', // 春分の日
    '2026-4-29', // 昭和の日
    '2026-5-3',  // 憲法記念日
    '2026-5-4',  // みどりの日
    '2026-5-5',  // こどもの日
    '2026-5-6',  // 振替休日
    '2026-7-20', // 海の日
    '2026-8-11', // 山の日
    '2026-9-21', // 敬老の日
    '2026-9-22', // 国民の休日
    '2026-9-23', // 秋分の日
    '2026-10-12',// スポーツの日
    '2026-11-3', // 文化の日
    '2026-11-23',// 勤労感謝の日
  ];
  
  return holidays2026.includes(`${y}-${m}-${d}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const mailLines = [];
  let hasAnyVacant = false;

  for (const target of TARGETS) {
    console.log(`[巡回] ${target.name} を確認中...`);
    const page = await browser.newPage();

    try {
      // 1. 検索実行
      await page.goto(SITE_URL, { waitUntil: 'networkidle' });
      await page.selectOption('#purpose-home', target.purpose);
      await page.waitForTimeout(500);
      await page.selectOption('#bname-home', target.park);
      await page.waitForTimeout(500);
      await page.click('#btn-go');
      
      // 2. 検索結果表示と「月表示」展開
      await page.waitForSelector('text=月表示', { timeout: 15000 });
      await page.click('text=月表示');
      await page.waitForTimeout(3000);

      // 3. 画面上のカレンダーの全セル（日付マス）を解析
      const cellTexts = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('.status-calendar-box td, .mansion-facility td, td'));
        return cells.map(c => c.innerText.trim()).filter(t => t.length > 0);
      });

      const parkVacantLines = [];

      for (const text of cellTexts) {
        const lines = text.split('\n').map(l => l.trim());
        if (lines.length >= 2) {
          const dayNum = parseInt(lines[0], 10); 
          const mark = lines[1]; 

          if (!isNaN(dayNum) && (mark === '▲' || mark === '●')) {
            const now = new Date();
            const checkDate = new Date(now.getFullYear(), now.getMonth(), dayNum);
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][checkDate.getDay()];

            // 【条件】土曜日(6) か 日曜日(0) か 祝日の場合のみ対象にする
            if (checkDate.getDay() === 0 || checkDate.getDay() === 6 || isHoliday(checkDate)) {
              const month = now.getMonth() + 1;
              const label = isHoliday(checkDate) ? '祝' : dayOfWeek;
              parkVacantLines.push(`${month}月${dayNum}日（${label}）`);
            }
          }
        }
      }

      // テストモード用のダミーデータ（見た目確認用）
      if (TEST_MODE && target.name === '日比谷公園（人工芝）') {
        parkVacantLines.push('6月20日（土）');
        parkVacantLines.push('6月21日（日）');
      }

      // 空きが見つかった場合のみメール本文に追加
      if (parkVacantLines.length > 0) {
        mailLines.push(`【${target.name}】`);
        mailLines.push(parkVacantLines.join('\n'));
        mailLines.push('');
        hasAnyVacant = true;
      }

    } catch (err) {
      console.log(`[エラー] ${target.name} の解析中に問題が発生しました: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // メール送信処理
  if (hasAnyVacant) {
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
      subject: '【速報】テニスコート月間空き状況',
      text: mailLines.join('\n')
    });

    console.log('メールを送信しました。');
  } else {
    console.log('対象日に空きコートはありませんでした（メール送信スキップ）。');
  }
})();
