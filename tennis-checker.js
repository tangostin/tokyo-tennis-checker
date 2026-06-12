const { chromium } = require('playwright');

const TARGETS = [
  { name: '日比谷公園（人工芝）', purpose: '1000_1030', park: '1000' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const target = TARGETS[0];

  console.log('=== 調査第4弾（月表示データの構造解析） ===');

  let page = await browser.newPage();
  let jsonText = null;

  // 月表示クリック後に流れる、サイズの大きい方のJSONを狙い撃ちしてキャッチします
  page.on('response', async (response) => {
    if (response.url().includes('rsvWOpeInstSrchVacantAjaxAction.do')) {
      try {
        const text = await response.text();
        if (text.length > 2000) { // 週表示（小さい）と区別するため2000文字以上を指定
          jsonText = text;
          console.log(`月表示のJSONキャプチャ成功！ (サイズ: ${text.length}文字)`);
        }
      } catch (e) {}
    }
  });

  // 1. 通常通り検索を実行
  await page.goto(SITE_URL, { waitUntil: 'networkidle' });
  await page.selectOption('#purpose-home', target.purpose);
  await page.waitForTimeout(500);
  await page.selectOption('#bname-home', target.park);
  await page.waitForTimeout(500);
  await page.click('#btn-go');
  await page.waitForTimeout(4000); // 検索完了待ち

  // 2. 「月表示」をカチッとクリック
  console.log('「月表示」をクリックします...');
  await page.click('text=月表示');
  
  // 3. データが流れ込んでくるのを待つ
  await page.waitForTimeout(6000);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      console.log('\n--- 月表示JSONの生データ（最初の2件分） ---');
      
      const items = Array.isArray(parsed) 
        ? parsed 
        : (parsed.vacantList || parsed.list || Object.values(parsed).find(Array.isArray) || [parsed]);

      // 最初の2件を詳細表示
      console.log(JSON.stringify(items.slice(0, 2), null, 2));
      
      console.log('\n--- 月表示JSONの全ての「キー（名前）」のリスト ---');
      if (items[0]) {
        console.log(Object.keys(items[0]));
        
        // もし2重構造（配列の中にさらに配列）になっている場合、その中身も解析します
        const nestedKey = Object.keys(items[0]).find(k => Array.isArray(items[0][k]));
        if (nestedKey && items[0][nestedKey][0]) {
          console.log(`\n内側の配列「${nestedKey}」のキーリスト:`);
          console.log(Object.keys(items[0][nestedKey][0]));
          console.log(`\n内側の配列の最初のデータ構造:`);
          console.log(JSON.stringify(items[0][nestedKey][0], null, 2));
        }
      }

    } catch (e) {
      console.log('JSON解析エラー: ' + e.message);
    }
  } else {
    console.log('月表示のJSONが取得できませんでした。');
  }

  await browser.close();
  console.log('=== 調査終了 ===');
})();
