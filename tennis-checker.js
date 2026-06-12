const { chromium } = require('playwright');

const TARGETS = [
  { name: '日比谷公園（人工芝）', purpose: '1000_1030', park: '1000' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const target = TARGETS[0];

  console.log('=== 調査第5弾（画面の文字をのぞき見） ===');

  let page = await browser.newPage();

  // 1. 通常通り検索を実行
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.selectOption('#purpose-home', target.purpose);
  await page.waitForTimeout(500);
  await page.selectOption('#bname-home', target.park);
  await page.waitForTimeout(500);
  await page.click('#btn-go');
  await page.waitForTimeout(4000); // 最初の読み込み待ち

  // 2. 「月表示」をカチッとクリック
  console.log('「月表示」をクリックします...');
  await page.click('text=月表示');
  
  // 画面が完全に書き換わるのをしっかり待つ（5秒）
  await page.waitForTimeout(5000); 

  // 3. 画面に見えているテキストをまるごと取得
  const bodyText = await page.innerText('body');
  
  console.log('\n--- 画面から検出された日付・空きマークの文字 ---');
  const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // 日付（日）や空きマーク（●、▲、予約）が含まれる行だけを抜き出して表示
  let foundCount = 0;
  lines.forEach(line => {
    if (line.includes('2026') || line.includes('月') || line.includes('日') || line.includes('●') || line.includes('▲')) {
      console.log(`[画面の文字] ${line}`);
      foundCount++;
    }
  });

  if (foundCount === 0) {
    console.log('対象となる文字が画面から見つかりませんでした。全テキストを表示します：');
    console.log(bodyText.substring(0, 1000));
  }

  await browser.close();
  console.log('=== 調査終了 ===');
})();
