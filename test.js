const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(
    'https://kouen.sports.metro.tokyo.lg.jp/web/rsvWOpeInstSrchVacantAction.do',
    { waitUntil: 'networkidle' }
  );

  await page.goto(
    'https://kouen.sports.metro.tokyo.lg.jp/web/rsvWOpeInstSrchVacantAction.do',
    {
      waitUntil: 'networkidle'
    }
  );

  console.log(page.url());
  console.log(await page.title());

  await browser.close();
})();
