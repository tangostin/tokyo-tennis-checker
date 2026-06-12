const { chromium } = require('playwright');

// 調査のため、日比谷公園（人工芝）の1施設だけに絞っています
const TARGETS = [
  { name: '日比谷公園（人工芝）', purpose: '1000_1030', park: '1000' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const target = TARGETS[0];

  console.log('=== 調査開始: ' + target.name + ' ===');

  let page = await browser.newPage();
  let jsonText = null;

  page.on('response', async (response) => {
    if (response.url().includes('rsvWOpeInstSrchVacantAjaxAction.do')) {
      try {
        jsonText = await response.text();
        console.log('JSONキャプチャ成功！');
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
      const items = Array.isArray(parsed) 
        ? parsed 
        : (parsed.vacantList || parsed.list || Object.values(parsed).find(Array.isArray) || []);

      console.log(`\n【結果】JSONから合計 ${items.length} 件のデータが見つかりました。`);
      
      if (items.length > 0) {
        // 空き・満員に関わらず、最初と最後のデータの日付を表示してみる
        const firstDay = items[0].useDay;
        const lastDay = items[items.length - 1].useDay;
        console.log(`最初の日付データ: ${firstDay}`);
        console.log(`最後の日付データ: ${lastDay}`);
      }
    } catch (e) {
      console.log('JSONの解析に失敗しました: ' + e.message);
    }
  } else {
    console.log('JSONがキャプチャできませんでした。');
  }

  await browser.close();
  console.log('=== 調査終了 ===');
})();
