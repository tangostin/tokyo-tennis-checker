const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

const TARGETS = [
  { name: '猿江恩賜公園', purpose: '1000_1030', park: '1040' },
  { name: '木場公園', purpose: '1000_1030', park: '1060' },
  { name: '祖師谷公園', purpose: '1000_1030', park: '1070' }
];

(async () => {

  const browser = await chromium.launch({
    headless: true
  });

  let results = [];

  for (const target of TARGETS) {

    const page = await browser.newPage();

    let jsonText = null;

    page.on('response', async (response) => {

      if (
        response.url().includes(
          'rsvWOpeInstSrchVacantAjaxAction.do'
        )
      ) {
        try {
          jsonText = await response.text();
        } catch (e) {}
      }
    });

    console.log('OPEN ' + target.name);

await page.goto(
  'https://kouen.sports.metro.tokyo.lg.jp/web/',
  { waitUntil: 'networkidle' }
);

const title = await page.title();

console.log('URL=' + page.url());
console.log('TITLE=' + title);

if (title.includes('お知らせ')) {
  console.log('SITE ERROR');
  await page.close();
  continue;
}

await page.waitForSelector('#purpose-home', {
  timeout: 60000
});

console.log('FOUND PURPOSE');

await page.selectOption(
  '#purpose-home',
  target.purpose
);

    await page.waitForTimeout(1000);

    await page.selectOption(
      '#bname-home',
      target.park
    );

    await page.waitForTimeout(1000);

    await page.click('#btn-go');

    await page.waitForTimeout(5000);

    results.push(
      `===== ${target.name} =====\n` +
      (jsonText || '取得失敗')
    );

    await page.close();
  }

  await browser.close();

  const transporter =
    nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: 'テニス空き状況テスト',
    text: results.join('\n\n')
  });

})();
