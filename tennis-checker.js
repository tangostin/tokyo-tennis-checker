const { chromium } = require('playwright');

const TARGETS = [
  { name: '日比谷公園（人工芝）', purpose: '1000_1030', park: '1000' }
];

const SITE_URL = 'https://kouen.sports.metro.tokyo.lg.jp/web/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const target = TARGETS[0];

  console.log('=== 調査第3弾（月表示の展開テスト） ===');

  let page = await browser.newPage();
  
  // 検索後に流れる全ての通信（JSONなど）を監視
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('AjaxAction.do')) {
      try {
        const text = await response.text();
        console.log(`[通信キャプチャ] URL: ${url.substring(url.lastIndexOf('/'))} (サイズ: ${text.length}文字)`);
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
  await page.waitForTimeout(5000); // 検索完了を待つ

  console.log('\n--- ページ内の「月」に関係しそうな要素を調査 ---');
  
  // ページ内にある「月」という文字が入ったクリック可能な要素をリストアップ
  const elements = await page.evaluate(() => {
    const clickables = Array.from(document.querySelectorAll('a, button, div, span, img, input'));
    return clickables
      .filter(el => el.textContent && el.textContent.includes('月'))
      .map(el => ({
        tagName: el.tagName,
        text: el.textContent.trim().substring(0, 30),
        id: el.id,
        className: el.className
      })).slice(0, 10); // 上位10件
  });
  console.log(elements);

  console.log('\n--- 「月間状況」や「月表示」らしきマークのクリックに挑戦 ---');

  // サイトによくある「月間状況」や「月表示」というテキスト、または開閉ボタンを狙ってクリックしてみる
  try {
    // 「月」という文字を含むボタンやリンクを探してクリックを試みる
    const clickTargets = ['text=月間', 'text=月表示', 'text=当月', '.icon-plus', '.btn-expand'];
    let clicked = false;

    for (const selector of clickTargets) {
      const isVisible = await page.locator(selector).count() > 0;
      if (isVisible) {
        console.log(`ターゲット発見、クリックします: ${selector}`);
        await page.click(selector);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // テキストで見つからない場合、開閉用っぽいマーク（imgやボタン）を強制クリックしてみる実験
      console.log('特定のテキストで見つからないため、ページ内の最初の「月」を含む要素をクリックしてみます。');
      await page.click('xpath=//*[contains(text(), "月")]');
    }

  } catch (err) {
    console.log('クリック実験エラー（気にする必要はありません）: ' + err.message);
  }

  // クリックした後に新しいデータが流れ込んでくるのをしばらく待つ
  console.log('クリック後のデータ読み込み待ち（8秒）...');
  await page.waitForTimeout(8000);

  await browser.close();
  console.log('=== 調査終了 ===');
})();
