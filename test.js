const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('response', async (response) => {
    const url = response.url();

    if (
      url.includes('AjaxAction')
    ) {
      console.log('AJAX=' + url);
    }
  });

  await page.goto('https://kouen.sports.metro.tokyo.lg.jp/web/', {
    waitUntil: 'networkidle'
  });

  await page.selectOption('#purpose-home', '1000_1030');
  await page.waitForTimeout(2000);

  await page.selectOption('#bname-home', '1040');
  await page.waitForTimeout(2000);

  await page.click('#btn-go');

  await page.waitForTimeout(15000);

  console.log('URL=' + page.url());

  await browser.close();
})();
