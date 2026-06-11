const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

const TARGETS = [
  { name: '猿江恩賜公園', purpose: '1000_1030', park: '1040' },
  { name: '木場公園', purpose: '1000_1030', park: '1060' },
  { name: '祖師谷公園', purpose: '1000_1030', park: '1070' }
];

// 日付と曜日を整形する関数
function formatDateWithDay(dateNum) {
  if (!dateNum) return '';
  const str = String(dateNum);
  if (str.length !== 8) return str;
  const y = parseInt(str.substring(0, 4));
  const m = parseInt(str.substring(4, 6)) - 1;
  const d = parseInt(str.substring(6, 8));
  const date = new Date(y, m, d);
  const dayList = ['日', '月', '火', '水', '木', '金', '土'];
  const day = dayList[date.getDay()];
  return `${y}/${m + 1}/${d}（${day}）`;
}

// 時間を整形する関数
function formatTime(timeNum) {
  if (timeNum === undefined || timeNum === null) return '';
  const str = String(timeNum).padStart(4, '0');
  return `${str.substring(0, 2)}:${str.substring(2, 4)}`;
}

(async () => {

  const browser = await chromium.launch({
    headless: true
  });

  const mailLines = [];
  let hasAnyVacant = false;

  for (const target of TARGETS) {

    console.log('OPEN ' + target.name);

    let pageReady = false;
    let page = null;
    let jsonText = null;

    for (let retry = 1; retry <= 3; retry++) {
      page = await browser.newPage();
      page.on('response', async (response) => {
        if (response.url().includes('rsvWOpeInstSrchVacantAjaxAction.do')) {
          try {
            jsonText = await response.text();
            console.log('JSON CAPTURED');
          } catch (e) {}
        }
      });

      await page.goto('https://kouen.sports.metro.tokyo.lg.jp/web/', {
        waitUntil: 'networkidle'
      });

      console.log('TRY=' + retry);

      try {
        await page.waitForSelector('#purpose-home', { timeout: 10000 });
        console.log('FOUND PURPOSE');
        pageReady = true;
        break;
      } catch (e) {
        console.log('PURPOSE NOT FOUND');
        await page.close();
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    if (!pageReady) {
      console.log('SITE UNAVAILABLE - STOP CHECKING');
      break;
    }

    await page.selectOption('#purpose-home', target.purpose);
    await page.waitForTimeout(1000);
    await page.selectOption('#bname-home', target.park);
    await page.waitForTimeout(1000);
    await page.click('#btn-go');
    console.log('SEARCH CLICKED');

    await page.waitForTimeout(10000);

    const parkVacantLines = [];

    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        const items = Array.isArray(parsed) 
          ? parsed 
          : (parsed.vacantList || parsed.list || Object.values(parsed).find(Array.isArray) || []);

        for (const item of items) {
          if (item && item.alt === '空き') {
            const dateStr = formatDateWithDay(item.useDay);
            const startStr = formatTime(item.startTime);
            const endStr = formatTime(item.endTime);
            const count = item.vacantNum || '1'; // 面数。データがない場合は1とする
            
            if (dateStr && startStr && endStr) {
              parkVacantLines.push(`${dateStr} ${startStr}-${endStr}（${count}面）`);
            }
          }
        }
      } catch (e) {
        console.log('JSON PARSE ERROR');
      }
    }

    // 空きがある場合のみ、公園名と情報を追加
    if (parkVacantLines.length > 0) {
      mailLines.push(`【${target.name}】`);
      mailLines.push(parkVacantLines.join('\n'));
      mailLines.push(''); // スペース
      hasAnyVacant = true;
    }

    await page.close();
  }

  await browser.close();

  // 日本時間1時台（深夜の初回実行想定）かどうか
  const now = new Date();
  // GitHub ActionsはUTCなので+9時間して判定
  const jstHour = (now.getUTCHours() + 9) % 24;
  const isInitialRun = (jstHour === 1);

  // 空きがあるか、あるいは1時台の初回実行ならメール送信
  if (hasAnyVacant || isInitialRun) {
    
    // 末尾にURLを追加
    mailLines.push('https://kouen.sports.metro.tokyo.lg.jp/web/');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.NOTIFY_EMAIL,
      subject: hasAnyVacant ? '【空きあり】テニスコート状況' : 'テニス空き状況（定期通知）',
      text: mailLines.join('\n')
    });

    console.log('MAIL SENT');
  } else {
    console.log('NO VACANT COURTS - MAIL SKIPPED');
  }

})();
