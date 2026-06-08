const { chromium } = require('playwright');

(async () => {
  console.log('START');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('response', async (response) => {
    const url = response.url();

    if (url.includes('rsvWOpeInstSrchVacantAjaxAction.do')) {
      console.log('FOUND API');
      console.log(url);
    }
  });

  await page.goto('https://kouen.sports.metro.tokyo.lg.jp/web/', {
    waitUntil: 'networkidle'
  });

  console.log('TOP PAGE LOADED');

  await page.selectOption('#purpose-home', '1000_1030');
  console.log('PURPOSE SELECTED');

  await page.waitForTimeout(2000);

  await page.selectOption('#bname-home', '1040');
  console.log('PARK SELECTED');

  await page.waitForTimeout(2000);

  await page.click('#btn-go');
  console.log('SEARCH CLICKED');

  await page.waitForTimeout(10000);

  console.log('END');

  await browser.close();
})();
