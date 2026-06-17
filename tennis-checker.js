const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// 対象施設リスト（全13施設）
const TARGETS = [
  { name: '日比谷公園（人工芝）', purpose: '1000_1030', park: '1000' },
  { name: '芝公園（人工芝）', purpose: '1000_1030', park: '1010' },
  { name: '猿江恩賜公園', purpose: '1000_1030', park: '1040' },
  { name: '木場公園', purpose: '1000_1030', park: '1060' },
  { name: '祖師谷公園', purpose: '1000_1030', park: '1070' },
  { name: '大島小松川公園（人工芝）', purpose: '1000_1030', park: '1160' },
  { name: '汐入公園（人工芝）', purpose: '1000_1170', park: '1170' },
  { name: '井の頭恩賜公園（人工芝）', purpose: '1000_1220', park: '1220' }, 
  { name: '大井ふ頭海浜公園B（人工芝）', purpose: '1000_1030', park: '1315' },
  { name: '有明テニスC人工芝コート', purpose: '1000_1030', park: '1360' },
  { name: '大井ふ頭海浜公園A（ハード）', purpose: '1000_1020', park: '1310' },
  { name: '大井ふ頭海浜公園B（ハード）', purpose: '1000_1020', park: '1315' },
  { name: '有明テニス屋外ハードコート', purpose: '1000_1020', park: '1350' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';
const CACHE_FILE = path.join(__dirname, 'last_vacant.txt');

function isHoliday(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const holidays2026 = [
    '2026-1-1', '2026-1-12', '2026-2-11', '2026-2-23', '2026-3-20',
    '2026-4-29', '2026-5-3', '2026-5-4', '2026-5-5', '2026-5-6',
    '2026-7-20', '2026-8-11', '2026-9-21', '2026-9-22', '2026-9-23',
    '2026-10-12', '2026-11-3', '2026-11-23'
  ];
  return holidays2026.includes(`${y}-${m}-${d}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const currentMailLines = [];

// 実行時の「今日」の日付情報を取得（GitHub環境でも強制的に日本時間にする）
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
const todayNum = now.getDate(); // 日本時間の日にち（1〜31）

  for (const target of TARGETS) {
    console.log(`[巡回] ${target.name} を確認中...`);
    const page = await browser.newPage();
    let success = false;

    // TOPでのセレクトボックス呼び出しを最大3回リトライ
    for (let retry = 1; retry <= 3; retry++) {
      try {
        await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForSelector('#purpose-home', { timeout: 5000 });
        
        await page.selectOption('#purpose-home', target.purpose);
        await page.waitForTimeout(500);
        await page.selectOption('#bname-home', target.park);
        await page.waitForTimeout(500);
        await page.click('#btn-go');
        
        await page.waitForSelector('.status-calendar-box', { timeout: 10000 });
        success = true;
        break; 
      } catch (e) {
        console.log(`  -> [アクセス失敗] ${target.name} (トライ ${retry}/3): ページを入り直します...`);
        await page.waitForTimeout(2000);
      }
    }

    if (!success) {
      console.log(`[アクセス断念] ${target.name} はスキップして次の施設に向かいます。`);
      await page.close();
      continue; 
    }

    try {
      // 1. 詳細表示（月表示）ボタンをクリックしてカレンダーを展開
      const expandButton = page.locator('.status-calendar-box [aria-label="詳細表示"]').first();
      console.log('  -> 「詳細表示（月表示）」ボタンをクリックします...');
      await expandButton.click();
      
      // 月表示テーブルが最初に出現するのを待つ
      await page.waitForSelector('#month-info', { timeout: 30000 });
      await page.waitForTimeout(2000);

      // カレンダー内の空き枠を解析する共通関数（当月・翌月の両方で使い回します）
      async function scanCurrentCalendarPage() {
        const parkVacantLines = [];
        const cells = await page.$$('#month-info td');

        for (const cell of cells) {
          const id = await cell.getAttribute('id');
          if (!id || !id.startsWith('month_')) continue;

          const dateStr = id.replace('month_', '');
          const targetYear = parseInt(dateStr.slice(0, 4), 10);
          const targetMonth = parseInt(dateStr.slice(4, 6), 10);
          const targetDay = parseInt(dateStr.slice(6, 8), 10);

          const imgElement = await cell.$('img');
          if (imgElement) {
            let altText = await imgElement.getAttribute('alt');
            if (altText) altText = altText.trim();

            if (altText === '空き' || altText === '一部空き') {
              const todayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const checkDate = new Date(targetYear, targetMonth - 1, targetDay);

              // 今日より前の過去の日付は除外
              if (checkDate < todayObj) continue; 

              console.log(`    [データ確認] ${targetMonth}月${targetDay}日: 画像の文字 = [${altText}]`);
              const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][checkDate.getDay()];
              const label = isHoliday(checkDate) ? '祝' : dayOfWeek;
              parkVacantLines.push(`${targetMonth}月${targetDay}日（${label}）[${altText}]`);
            }
          }
        }
        return parkVacantLines;
      }

      // --- 【ステップA】当月分のカレンダーをスキャン ---
      // カレンダー上部にある現在の「年・月」テキストを取得して記憶しておく（翌月切り替えの判定用）
      // ※セレクタは一般的なカレンダーのヘッダーを想定しています（ズレがある場合は要調整）
      const getCalendarTitle = async () => {
        return await page.locator('.status-calendar-box .calendar-title, .status-calendar-box text').first().innerText().catch(() => '');
      };
      
      const currentMonthTitle = await getCalendarTitle();
      console.log(`  -> 当月のスキャンを開始します（現在の画面表示: ${currentMonthTitle.trim()}）`);
      
      const currentMonthResults = await scanCurrentCalendarPage();
      
      if (currentMonthResults.length > 0) {
        currentMailLines.push(`【${target.name}】`);
        currentMailLines.push(currentMonthResults.join('\n'));
        currentMailLines.push('');
      }

      // --- 【ステップB】22日〜月末限定：翌月分のカレンダーをスキャン ---
      if (todayNum >= 22) {
        // 「次月→」というテキストを含むリンクボタンを探してクリック
        const nextMonthButton = page.locator('.status-calendar-box a:has-text("次月"), .status-calendar-box button:has-text("次月")').first();
        
        if (await nextMonthButton.count() > 0) {
          console.log('  -> 【22日以降】翌月予約が解放されているため「次月→」をクリックします...');
          await nextMonthButton.click();

          // 重要：上部の「年月表示」が当月のテキストから変化するまで最大30秒じっと待つ（古い表示での誤検知を防ぐ）
          console.log('  -> 翌月カレンダーへ切り替え中... 年月表示の更新を待機します（最大30秒）');
          await page.waitForFunction(
            (oldTitle) => {
              const el = document.querySelector('.status-calendar-box .calendar-title') || document.querySelector('.status-calendar-box text');
              return el && el.innerText !== oldTitle;
            },
            currentMonthTitle,
            { timeout: 30000 }
          ).catch(() => {
            console.log('  -> [警告] 年月表示の切り替え確認がタイムアウトしました。そのままスキャンを試みます。');
          });

          // 切り替わり後の安全マージンとして2秒待機
          await page.waitForTimeout(2000);
          
          const nextMonthTitle = await getCalendarTitle();
          console.log(`  -> 翌月のスキャンを開始します（現在の画面表示: ${nextMonthTitle.trim()}）`);

          const nextMonthResults = await scanCurrentCalendarPage();
          
          if (nextMonthResults.length > 0) {
            // すでに当月分で施設名がメール線に入っていない場合のみ施設名を追加
            if (currentMonthResults.length === 0) {
              currentMailLines.push(`【${target.name}】`);
            }
            currentMailLines.push(nextMonthResults.join('\n'));
            currentMailLines.push('');
          }
        } else {
          console.log('  -> [注意] 「次月」ボタンが見つからなかったため、翌月のスキャンをスキップします。');
        }
      } else {
        console.log(`  -> 今日は ${todayNum} 日です（21日以下）。当月のみチェックし、翌月スキャンはスキップします。`);
      }

    } // データの読み込みとスキャン(try) の終わり
    catch (err) {
      console.log(`[解析エラー] ${target.name} のデータ読み込み中にエラーが発生しました。この公園はスキップします。`, err);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // メール本文の最終整形
  const currentVacantText = currentMailLines.join('\n').trim();
  const fullMailText = currentVacantText ? `${currentVacantText}\n\n${SITE_URL}` : SITE_URL;

  // --- 差分チェックのロジック ---
  let isFirstRun = !fs.existsSync(CACHE_FILE);
  let lastVacantText = '';
  if (!isFirstRun) {
    lastVacantText = fs.readFileSync(CACHE_FILE, 'utf8').trim();
  }

  if (isFirstRun || currentVacantText !== lastVacantText) {
    console.log(isFirstRun ? '初回実行のためメールを送信します。' : '空き状況に変化（差分）があったため、メールを送信します。');

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
      text: fullMailText
    });

    console.log('メール送信完了。');
  } else {
    console.log('前回から空き状況に変化がありません。メール送信をスキップします。');
  }

  fs.writeFileSync(CACHE_FILE, currentVacantText, 'utf8');
})();
