const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

// 対象施設リスト（全13施設） - 正しい設定を完全に維持
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

// 祝日判定関数（2026年）
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

// ターゲットとなる最終期限日（Dateオブジェクト）を計算する関数
function getTargetLimitDate(now) {
  const todayNum = now.getDate();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth(); // 0-indexed

  if (todayNum >= 22) {
    // 22日以降は翌月末まで
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }
  // その月の最終日（日付に0を指定すると前月の末日になるため、targetMonth+1 の 0日を指定）
  return new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-http2',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  // 日本時間での現在時刻取得
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const todayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 時間をリセットした今日

  // 巡回の最終期限日（この日を含む週までスキャンする）
  const limitDate = getTargetLimitDate(now);
  console.log(`[巡回設定] 本日: ${now.toLocaleDateString('ja-JP')} | スキャン期限: ${limitDate.toLocaleDateString('ja-JP')} まで`);

  for (const target of TARGETS) {
    console.log(`\n==================================================`);
    console.log(`[巡回開始] ${target.name} を確認中...`);
    const page = await browser.newPage();

    // 画像・メディアの読み込みをブロックして超高速化
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        route.abort();
      } else {
        route.continue();
      }
    });

    let success = false;

    // 1. TOPでの施設指定〜検索結果画面のロード（週表示カレンダーは初期露出）までを最大3回リトライ
    for (let retry = 1; retry <= 3; retry++) {
      try {
        await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForSelector('#purpose-home', { timeout: 10000 });
        
        await page.selectOption('#purpose-home', target.purpose);
        await page.waitForTimeout(400);
        await page.selectOption('#bname-home', target.park);
        await page.waitForTimeout(400);
        await page.click('#btn-go');
        
        // カレンダー枠が表示されるのを待つ
        await page.waitForSelector('.status-calendar-box', { timeout: 15000 });
        success = true;
        break; 
      } catch (e) {
        console.log(`  -> [アクセス失敗] ${target.name} (トライ ${retry}/3): ページをリロードします...`);
        await page.waitForTimeout(1500);
      }
    }

    if (!success) {
      console.log(`[アクセス断念] ${target.name} はスキップして次の施設に向かいます。`);
      await page.close();
      continue; 
    }

    try {
      // 週表示カレンダーの安定化ウェイト
      await page.waitForSelector('td[id^="20"]', { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(1000);

      // 表示されているカレンダーの「最初の日付セルのID（YYYYMMDD形式）」を抽出する関数
      const getFirstCellDateStr = async () => {
        const firstCell = await page.$('td[id^="20"]');
        if (firstCell) {
          const id = await firstCell.getAttribute('id');
          return id ? id.split('_')[0] : ''; // "20260729"
        }
        return '';
      };

      // 表示されているカレンダーの「最大の日付（Dateオブジェクト）」を特定する関数
      const getMaxCellDate = async () => {
        const cells = await page.$$('td[id^="20"]');
        let maxDate = new Date(1970, 0, 1);
        for (const cell of cells) {
          const id = await cell.getAttribute('id');
          if (id) {
            const dateStr = id.split('_')[0]; // "20260729"
            const y = parseInt(dateStr.slice(0, 4), 10);
            const m = parseInt(dateStr.slice(4, 6), 10) - 1;
            const d = parseInt(dateStr.slice(6, 8), 10);
            const cellDate = new Date(y, m, d);
            if (cellDate > maxDate) {
              maxDate = cellDate;
            }
          }
        }
        return maxDate;
      };

      // この公園の「空きが見つかったユニークな日付（文字列）」を保持するSet構造
      const vacantDatesSet = new Set();
      let isFinished = false;
      let pageCount = 1;

      // 「期限日（当月末 or 翌月末）」を超える週になるまでループ
      while (!isFinished) {
        console.log(`  -> [ページ ${pageCount}] 週表示カレンダーをスキャン中...`);

        // 現在表示されているカレンダーの最大日付をチェック
        const currentMaxDate = await getMaxCellDate();
        if (currentMaxDate >= limitDate) {
          isFinished = true; // 今回のスキャンで終了
        }

        // --- 空き枠のスキャン（超高速・日付のみ抽出ロジック） ---
        // class="available" が付与されているセル（空き枠）を全取得
        const availableCells = await page.$$('td.available');

        for (const cell of availableCells) {
          const id = await cell.getAttribute('id'); // 例: "20260729_40"
          if (!id) continue;

          const dateStr = id.split('_')[0]; // "20260729"
          const targetYear = parseInt(dateStr.slice(0, 4), 10);
          const targetMonth = parseInt(dateStr.slice(4, 6), 10);
          const targetDay = parseInt(dateStr.slice(6, 8), 10);

          const checkDate = new Date(targetYear, targetMonth - 1, targetDay);

          // 1. 過去日付はスキャンから除外
          if (checkDate < todayObj) continue;

          // 2. 期限日を超える日付も除外
          if (checkDate > limitDate) continue;

          // 3. 土曜日、日曜日、祝日のみを対象にするフィルター
          const isWeekendOrHoliday = (checkDate.getDay() === 0 || checkDate.getDay() === 6 || isHoliday(checkDate));

          if (isWeekendOrHoliday) {
            // YYYY-MM-DD 形式でSetに追加（自動で重複が排除される）
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][checkDate.getDay()];
            const label = isHoliday(checkDate) ? '祝' : dayOfWeek;
            
            const logDateStr = `${targetMonth}月${targetDay}日（${label}）`;
            vacantDatesSet.add(logDateStr);
          }
        }

        // 期限日に達している、またはこれ以上進めない場合はループを抜ける
        if (isFinished) {
          console.log(`  -> 設定されたスキャン期限 (${limitDate.toLocaleDateString('ja-JP')}) に到達したため、巡回を終了します。`);
          break;
        }

        // --- 「次週>>」ボタンでのページ送り処理 ---
        const nextWeekButton = page.locator('a:has-text("次週"), button:has-text("次週")').first();
        if (await nextWeekButton.count() > 0) {
          const beforeDateStr = await getFirstCellDateStr();
          console.log(`  -> 「次週>>」ボタンをクリックして進みます... (切り替え前基準日: ${beforeDateStr})`);

          await nextWeekButton.click().catch(async () => {
            await nextWeekButton.evaluate(el => el.click());
          });

          // 最初の日付セルの日付が変わるまで精密ポーリング監視（最大15秒）
          let changed = false;
          const startTime = Date.now();
          while (Date.now() - startTime < 15000) {
            await page.waitForTimeout(500); // 0.5秒ごとにチェック
            const currentDateStr = await getFirstCellDateStr();
            if (currentDateStr && currentDateStr !== beforeDateStr) {
              changed = true;
              break;
            }
          }

          if (changed) {
            await page.waitForTimeout(1000); // 描画安定のためのバッファ
            pageCount++;
          } else {
            console.log('  -> [警告] 次の週への切り替え待機がタイムアウトしました。巡回を終了します。');
            break;
          }
        } else {
          console.log('  -> [案内] 「次週>>」ボタンが見つからないため、これ以上の巡回を終了します。');
          break;
        }
      }

      // --- 空き情報の即時メール送信 ---
      if (vacantDatesSet.size > 0) {
        // Setを配列に戻し、きれいにフォーマット
        const vacantLines = Array.from(vacantDatesSet).map(dateLine => `${dateLine} [空きあり]`);
        
        console.log(`  -> 🎉 【空き発見】${target.name} に ${vacantLines.length} 日間の対象日があります！`);
        await sendImmediateMail(target.name, vacantLines);
      } else {
        console.log(`  -> 【空きなし】${target.name} に対象となる土日祝の空きはありませんでした。`);
      }

    } catch (err) {
      console.log(`[解析エラー] ${target.name} のデータ読み込み中にエラーが発生しました。次の公園へ進みます。`, err);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\n==================================================');
  console.log('すべての施設の巡回チェックが終了しました。');
})();
