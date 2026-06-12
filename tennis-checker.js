const { chromium } = require('playwright');

const TARGETS = [
  { name: '日比谷公園（人工芝）', purpose: '1000_1030', park: '1000' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const target = TARGETS[0];

  console.log('=== 調査第2弾: ' + target.name + ' ===');

  let page = await browser.newPage();
  let jsonText = null;

  page.on('response', async (response) => {
    if (response.url().includes('rsvWOpeInstSrchVacantAjaxAction.do')) {
      try {
        jsonText = await response.text();
      } catch (e) {}
    }
  });

  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.selectOption('#purpose-home', target.purpose);
  await page.waitForTimeout(500);
  await page.selectOption('#bname-home', target.park);
  await page.waitForTimeout(500);
  await page.click('#btn-go');

  // データの読み込みを待つ
  await page.waitForTimeout(8000);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      console.log('\n--- キャプチャしたJSONの生データ（最初の2件分） ---');
      
      // 配列かオブジェクトかに応じて、中身の構造を分かりやすく出力します
      const items = Array.isArray(parsed) 
        ? parsed 
        : (parsed.vacantList || parsed.list || Object.values(parsed).find(Array.isArray) || [parsed]);

      // 最初の2件だけ中身を細かく表示
      console.log(JSON.stringify(items.slice(0, 2), null, 2));
      
      console.log('\n--- JSONにある全ての「キー（名前）」のリスト ---');
      if (items[0]) {
        console.log(Object.keys(items[0]));
      }

    } catch (e) {
      console.log('JSON解析エラー: ' + e.message);
    }
  } else {
    console.log('JSONがキャプチャできませんでした。');
  }

  await browser.close();
  console.log('=== 調査終了 ===');
})();
