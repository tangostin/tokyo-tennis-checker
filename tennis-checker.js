const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// ==========================================
// 【テスト設定】
// true の間はダミーの空きデータを注入してメールの見た目を確認できます。
// 動作確認が取れ、本番稼動させる際は false にしてください。
const TEST_MODE = true;
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
      await page.waitForTimeout(3000); // カレンダーが描画されるのを少し待つ

      // 3. 画面上のカレンダーの全セル（日付マス）を解析
      // クラス名や構造から、カレンダー内の日付セルのテキストを丸ごと引っこ抜きます
      const cellTexts = await page.evaluate(() => {
        // カレンダーの枠（status-calendar-boxなど）の中にあるすべてのセルを取得
        const cells = Array.from(document.querySelectorAll('.status-calendar-box td, .mansion-facility td, td'));
        return cells.map(c => c.innerText.trim()).filter(t => t.length > 0);
      });

      const parkVacantLines = [];

      // 各セルのテキストを検証（例: 「15\n▲」や「20\n×」のような改行区切りで入っています）
      for (const text of cellTexts) {
        // 数字と記号に分解
        const lines = text.split('\n').map(l => l.trim());
        if (lines.length >= 2) {
          const dayNum = parseInt(lines[0], 10); // 日にち (例: 15)
          const mark = lines[1]; // マーク (例: ▲, ●, ×)

          if (!isNaN(dayNum) && (mark === '▲' || mark === '●')) {
            // 現在の年・月から、その「日にち」の曜日を計算
            const now = new Date();
            const checkDate = new Date(now.getFullYear(), now.getMonth(), dayNum);
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][checkDate.getDay()];

            // 土曜日(6)または日曜日(0)の場合のみリストに追加（祝日はカレンダー上の色判定が必要なため一旦土日に絞っています）
            if (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
              const month = now.getMonth() + 1;
              parkVacantLines.push(`${month}/${dayNum}（${dayOfWeek}）: 【${mark}】空きあり`);
            }
          }
        }
      }

      // テストモードかつ最初の公園の場合、ダミーデータを注入
      if (TEST_MODE && target.name === '日比谷公園（人工芝）') {
        parkVacantLines.push('6/20（土）: 【●】空きあり (テストデータ)');
        parkVacantLines.push('6/21（日）: 【▲】一部空きあり (テストデータ)');
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
    console.log('土日祝に空きコートはありませんでした（メール送信スキップ）。');
  }
})();
