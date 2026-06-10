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

```
console.log('OPEN ' + target.name);

let pageReady = false;
let page;
let jsonText = null;

for (let retry = 1; retry <= 3; retry++) {

  const context = await browser.newContext();

  page = await context.newPage();

  page.on('response', async (response) => {

    if (
      response.url().includes(
        'rsvWOpeInstSrchVacantAjaxAction.do'
      )
    ) {
      try {
        jsonText = await response.text();
        console.log('JSON CAPTURED');
      } catch (e) {}
    }
  });

  await page.goto(
    'https://kouen.sports.metro.tokyo.lg.jp/web/',
    {
      waitUntil: 'networkidle'
    }
  );

  console.log('TRY=' + retry);

  try {

    await page.waitForSelector(
      '#purpose-home',
      { timeout: 10000 }
    );

    console.log('FOUND PURPOSE');

    pageReady = true;

    break;

  } catch {

    console.log('PURPOSE NOT FOUND');

    await page.close();

    await new Promise(
      r => setTimeout(r, 5000)
    );
  }
}

if (!pageReady) {

  console.log(
    'SITE UNAVAILABLE - STOP CHECKING'
  );

  break;
}

await page.selectOption(
  '#purpose-home',
  target.purpose
);

console.log('PURPOSE SELECTED');

await page.waitForTimeout(1000);

await page.selectOption(
  '#bname-home',
  target.park
);

console.log('PARK SELECTED');

await page.waitForTimeout(1000);

await page.click('#btn-go');

console.log('SEARCH CLICKED');

await page.waitForTimeout(10000);

console.log(
  jsonText
    ? 'JSON OK'
    : 'JSON NG'
);

results.push(
  `===== ${target.name} =====\n` +
  (jsonText || '取得失敗')
);

await page.close();
```

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
