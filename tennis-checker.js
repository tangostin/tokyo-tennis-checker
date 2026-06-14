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
  { name: '大島小松川公園（人工芝）', purpose: '1000_1160', park: '1160' },
  { name: '汐入公園（人工芝）', purpose: '1000_1030', park: '1170' },
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

  for (const target of TARGETS) {
    console.log(`[巡回] ${target.name} を確認中...`);
    const page = await browser.newPage();
    let success = false;

    // 【要件追加】サイトが不安定なため、TOPでのセレクトボックス呼び出しを最大3回リトライする
    for (let retry = 1; retry <= 3; retry++) {
      try {
        await page.goto(SITE_URL, { waitUntil: 'networkidle', timeout: 20000 });
        
        // 目的のセレクトボックスが見えるか確認
        await page.waitForSelector('#purpose-home', { timeout: 5000 });
        
        // 見つかったら選択して検索実行
        await page.selectOption('#purpose-home', target.purpose);
        await page.waitForTimeout(500);
        await page.selectOption('#bname-home', target.park);
        await page.waitForTimeout(500);
        await page.click('#btn-go');
        
        // 月表示ボタンが出るまで待つ（ここまで来ればアクセス成功）
        await page.waitForSelector('text=月表示', { timeout: 10000 });
        success = true;
        break; // リトライを抜ける
      } catch (e) {
        console.log(`  -> [アクセス失敗] ${target.name} (トライ ${retry}/3): ページを入り直します...`);
        await page.waitForTimeout(2000);
      }
    }

    // 3回リトライしてもダメ、または途中の公園で完全にアクセス不能になった場合
    if (!success) {
      console.log(`[致命的エラー] ${target.name} へのアクセスが失敗したため、この回の巡回を安全に中断します。`);
      await page.close();
      break; // ループ全体を終了
    }

    // データの読み込みとスキャン
    try {
      await page.click('text=月表示');
      await page.waitForTimeout(3000);

      // カレンダー内の「日付セル」をすべて取得
      const cells = await page.$$('.status-calendar-box td, .mansion-facility td, td');
      const parkVacantLines = [];

      for (const cell of cells) {
        // セル内のテキスト（日付の数字）を取得
        const cellText = await cell.innerText();
        const lines = cellText.split('\n').map(l => l.trim());
        if (lines.length === 0 || !lines[0]) continue;

        const dayNum = parseInt(lines[0], 10);
        if (isNaN(dayNum)) continue;

        // セル内に img タグ（空きマーク画像）があるか確認
        const imgElement = await cell.$('img');
        if (imgElement) {
          // 画像の alt 属性の値を取得
          const altText = await imgElement.getAttribute('alt');

          // "一部空き" または "空き" に完全一致するか厳格に判定
          if (altText === '一部空き' || altText === '空き') {
            const now = new Date();
            const checkDate = new Date(now.getFullYear(), now.getMonth(), dayNum);
            const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][checkDate.getDay()];

            // 👇 【全曜日検証用】平日でも通知を飛ばすため、土日祝判定を一時的にスキップ中
            // if (checkDate.getDay() === 0 || checkDate.getDay() === 6 || isHoliday(checkDate)) {
              const month = now.getMonth() + 1;
              const label = isHoliday(checkDate) ? '祝' : dayOfWeek;
              // メールの内容に、どのマーク（[一部空き] または [空き]）だったかも明記します
              parkVacantLines.push(`${month}月${dayNum}日（${label}）[${altText}]`);
            // }
          }
        }
      }

      if (parkVacantLines.length > 0) {
        currentMailLines.push(`【${target.name}】`);
        currentMailLines.push(parkVacantLines.join('\n'));
        currentMailLines.push('');
      }
    } catch (err) {
      console.log(`[解析エラー] ${target.name} のデータ読み込み中にエラーが発生しました。この公園はスキップします。`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // メール本文の最終整形
  const currentVacantText = currentMailLines.join('\n').trim();
  const fullMailText = currentVacantText ? `${currentVacantText}\n\n${SITE_URL}` : SITE_URL;

  // --- 【要件3】差分チェックのロジック ---
  let isFirstRun = !fs.existsSync(CACHE_FILE);
  let lastVacantText = '';
  if (!isFirstRun) {
    lastVacantText = fs.readFileSync(CACHE_FILE, 'utf8').trim();
  }

  // 「1回目（キャッシュなし）」または「前回と内容が変わったとき（差分あり）」のみメール送信
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

  // 今回の最新状態をファイルに保存
  fs.writeFileSync(CACHE_FILE, currentVacantText, 'utf8');
})();
