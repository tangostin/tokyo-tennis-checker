```javascript
const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// 対象施設リスト（全13施設） - 現在の正しい設定を完全に維持
const TARGETS = [
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
  { name: '大井ふ頭海浜公園A（ハード）', purpose: '1000_1020', park: '1310' },
  { name: '大井ふ頭海浜公園B（ハード）', purpose: '1000_1020', park: '1315' },
  { name: '有明テニス屋外ハードコート', purpose: '1000_1020', park: '1350' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';

// メール送信用トランスポートの作成
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// 祝日判定関数
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

// 個別に即時メールを送信する関数
async function sendImmediateMail(targetName, vacantLines) {
  const mailText = `【${targetName}】に空きが見つかりました！\n\n` + vacantLines.join('\n') + `\n\n${SITE_URL}`;
  
  try {
    console.log(`  => [メール送信中] ${targetName} の空き通知を送信します...`);
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.NOTIFY_EMAIL,
      subject: `【速報】空きあり：${targetName}`,
      text: mailText
    });
    console.log(`  => [メール送信完了] ${targetName} の通知メールを送信しました。`);
  } catch (mailErr) {
    console.error(`  => [メール送信エラー] ${targetName} の送信に失敗しました:`, mailErr);
  }
}

(async () => {
  // ブラウザの起動
  const browser = await chromium.launch({ headless: true });

  // 実行時の「今日」の日付情報を取得（GitHub Actions等の環境でも日本時間にする）
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const todayNum = now.getDate(); // 日本時間の日にち（1〜31）

  for (const target of TARGETS) {
    console.log(`\n==================================================`);
    console.log(`[巡回開始] ${target.name} を確認中...`);
    const page = await browser.newPage();
    let success = false;

    // TOPでのセレクトボックス呼び出しを最大3回リトライ
    for (let retry = 1; retry <= 3; retry++) {
      try {
        await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForSelector('#purpose-home', { timeout: 10000 });
        
        await page.selectOption('#purpose-home', target.purpose);
        await page.waitForTimeout(600);
        await page.selectOption('#bname-home', target.park);
        await page.waitForTimeout(600);
        await page.click('#btn-go');
        
        // カレンダー大枠が表示されるのを待つ
        await page.waitForSelector('.status-calendar-box', { timeout: 15000 });
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
      // 1. 詳細表示（月表示）ボタンを待機
      const expandButton = page.locator('.status-calendar-box [aria-label="詳細表示"]').first();
      await expandButton.scrollIntoViewIfNeeded().catch(() => {});
      
      // 現在アコーディオンが開いているかどうか（aria-expanded）を確認
      const isExpanded = await expandButton.getAttribute('aria-expanded').catch(() => 'false');
      
      if (isExpanded === 'false') {
        console.log('  -> 「詳細表示（月表示）」ボタンをクリックして展開します...');
        // JSでの直接クリックにより、重いローディングマスクを完全にバイパスして確実に実行
        await expandButton.evaluate(el => el.click());
      } else {
        console.log('  -> カレンダーは既に展開された状態です。');
      }
      
      // 2. 月表示テーブルが「実際に表示（visible）」になるまで待機
      // 有明テニスの莫大な面数データ量に耐えられるよう、タイムアウトを40秒に延長。
      // 【重要】待機エラーになっても二重クリックをしないように、waitForSelector のみを愚直に行います。
      console.log('  -> 月表示テーブルが画面に描画されるのを待機しています（最大40秒）...');
      await page.waitForSelector('#month-info', { state: 'visible', timeout: 40000 });
      
      console.log('  -> 月表示テーブルを検出。描画とデータ通信の安定化のため2.5秒待機します...');
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2500); // 描画直後の安定化・完全同期のための安全マージン

      // 最初に見つかったカレンダーセルのIDから、現在表示されている年月（YYYYMM）を精密特定する関数
      const getActiveYearMonth = async () => {
        const firstCell = await page.$('#month-info td[id^="month_"]');
        if (firstCell) {
          const id = await firstCell.getAttribute('id');
          return id ? id.replace('month_', '').slice(0, 6) : ''; // "202606"
        }
        return '';
      };

      // カレンダー内の空き枠を解析する共通関数
      async function scanCurrentCalendarPage(activeYM) {
        const parkVacantLines = [];
        const cells = await page.$$('#month-info td');

        for (const cell of cells) {
          const id = await cell.getAttribute('id');
          if (!id || !id.startsWith('month_')) continue;

          const dateStr = id.replace('month_', ''); // "20260625"
          const targetYear = parseInt(dateStr.slice(0, 4), 10);
          const targetMonth = parseInt(dateStr.slice(4, 6), 10);
          const targetDay = parseInt(dateStr.slice(6, 8), 10);
          
          const cellYM = dateStr.slice(0, 6); // "202606"
          
          // 現アクティブ年月と一致しない端数の日（不慮のノイズ）はスキャンから完全に除外
          if (activeYM && cellYM !== activeYM) continue;

          const imgElement = await cell.$('img');
          if (imgElement) {
            let altText = await imgElement.getAttribute('alt');
            if (altText) altText = altText.trim();

            if (altText === '空き' || altText === '一部空き') {
              const todayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const checkDate = new Date(targetYear, targetMonth - 1, targetDay);

              // 今日より前の過去の日付は除外
              if (checkDate < todayObj) continue; 

              const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][checkDate.getDay()];

              // 土日祝のみを対象にするフィルター
              if (checkDate.getDay() === 0 || checkDate.getDay() === 6 || isHoliday(checkDate)) {
                console.log(`    [データ確認] ${targetMonth}月${targetDay}日: 画像の文字 = [${altText}]`);
                const label = isHoliday(checkDate) ? '祝' : dayOfWeek;
                parkVacantLines.push(`${targetMonth}月${targetDay}日（${label}）[${altText}]`);
              }
            }
          }
        }
        return parkVacantLines;
      }

      // この施設で見つかったすべての空き情報を保持する配列
      let thisParkVacantLines = [];

      // --- 【ステップA】当月分のカレンダーをスキャン ---
      const activeCurrentYM = await getActiveYearMonth();
      const currentMonthTitle = await page.locator('.status-calendar-box .calendar-title, .status-calendar-box text').first().innerText().catch(() => '当月');
      console.log(`  -> 当月のスキャンを開始します（画面表示: ${currentMonthTitle.trim()}, 年月コード: ${activeCurrentYM}）`);
      
      const currentMonthResults = await scanCurrentCalendarPage(activeCurrentYM);
      if (currentMonthResults.length > 0) {
        thisParkVacantLines = thisParkVacantLines.concat(currentMonthResults);
      }

      // --- 【ステップB】22日〜月末限定：翌月分のカレンダーをスキャン ---
      if (todayNum >= 22) {
        const nextMonthButton = page.locator('.status-calendar-box a:has-text("次月"), .status-calendar-box button:has-text("次月")').first();
        
        if (await nextMonthButton.count() > 0) {
          // クリック前の表示年月を取得（例: "202606"）
          const beforeYM = await getActiveYearMonth();
          console.log(`  -> 【22日以降】翌月スキャンに移行。クリック前の年月コード: ${beforeYM}`);

          console.log('  -> 「次月→」ボタンをクリックします...');
          await nextMonthButton.evaluate(el => el.click());

          console.log('  -> 翌月カレンダーへ切り替え中... (最初の日付セルが新しい年月に入れ替わるのを監視)');
          
          // 最初の日付セルの年月が新しい年月（例: "202607"）へ切り替わった瞬間を精密に待つ
          let changed = false;
          const startTime = Date.now();
          while (Date.now() - startTime < 40000) { // 最大40秒待機（有明対応）
            await page.waitForTimeout(1000); // 1.0秒ポーリングに落としてブラウザの負荷をさらに低減
            const currentYM = await getActiveYearMonth();
            if (currentYM && currentYM !== beforeYM) {
              changed = true;
              break;
            }
          }

          if (changed) {
            console.log('  -> [検出成功] カレンダーのID切り替えを確認。通信・描画完了のため4.0秒間安全に待機します...');
            // Ajax通信リクエストがすべて終了するのを待機
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            // 重い空き状況画像アセットが完全に置き換わるまで4.0秒の安全マージンを適用
            await page.waitForTimeout(4000);
          } else {
            console.log('  -> [警告] 切り替え待機がタイムアウトしました。長めのフォールバック待機（6秒）を行います。');
            await page.waitForTimeout(6000);
          }
          
          const activeNextYM = await getActiveYearMonth();
          const nextMonthTitle = await page.locator('.status-calendar-box .calendar-title, .status-calendar-box text').first().innerText().catch(() => '翌月');
          console.log(`  -> 翌月のスキャンを開始します（画面表示: ${nextMonthTitle.trim()}, 年月コード: ${activeNextYM}）`);

          const nextMonthResults = await scanCurrentCalendarPage(activeNextYM);
          if (nextMonthResults.length > 0) {
            thisParkVacantLines = thisParkVacantLines.concat(nextMonthResults);
          }
        } else {
          console.log('  -> [注意] 「次月」ボタンが見つからなかったため、翌月のスキャンをスキップします。');
        }
      } else {
        console.log(`  -> 今日は ${todayNum} 日です（21日以下）。翌月スキャンはスキップします。`);
      }

      // --- 【ステップC】この施設で空きが見つかっていて、かつ有効なデータがあれば即時メール送信 ---
      if (thisParkVacantLines.length > 0) {
        console.log(`  -> 🎉 【空き発見】${target.name} に ${thisParkVacantLines.length} 件の空き枠があります！`);
        await sendImmediateMail(target.name, thisParkVacantLines);
      } else {
        console.log(`  -> 【空きなし】${target.name} に対象日の空きはありませんでした。`);
      }

    } catch (err) {
      console.log(`[解析エラー] ${target.name} のデータ読み込み中にエラーが発生しました。この公園はスキップします。`, err);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\n==================================================');
  console.log('すべての施設の巡回チェックが終了しました。');
})();

```
