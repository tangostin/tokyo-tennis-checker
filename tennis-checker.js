const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

const TARGETS = [
  { name: '猿江恩賜公園', purpose: '1000_1030', park: '1040' },
  { name: '木場公園', purpose: '1000_1030', park: '1060' },
  { name: '祖師谷公園', purpose: '1000_1030', park: '1070' }
];

// 数値の日付 (20260609) を "2026/06/09" に整形する関数
function formatDate(dateNum) {
  if (!dateNum) return '';
  const str = String(dateNum);
  if (str.length !== 8) return str;
  return `${str.substring(0, 4)}/${str.substring(4, 6)}/${str.substring(6, 8)}`;
}

// 数値の時間 (900 や 1100) を "09:00" や "11:00" に整形する関数
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
  let hasAnyVacant = false; // 全施設通して1件でも空きがあるかどうかのフラグ

  for (const target of TARGETS) {

    console.log('OPEN ' + target.name);

    let pageReady = false;
    let page = null;
    let jsonText = null;

    for (let retry = 1; retry <= 3; retry++) {

      page = await browser.newPage();

      page.on('response', async (response) => {
        if (
          response.url().includes(
            'rsvWOpeInstSrchVacantAjaxAction.do'
          )
        ) {
          try {
            jsonText = await response.text();
            console.log('JSON CAPTURED');
          } catch (e) {
            // エラー時は無視して次へ
          }
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

      } catch (e) {
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

    // --- ここからJSONの解析・成型ロジック ---
    const parkVacantLines = [];

    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        
        // レスポンスが直接配列の場合と、オブジェクトの内部に配列がある場合の両方に対応
        const items = Array.isArray(parsed) 
          ? parsed 
          : (parsed.vacantList || parsed.list || Object.values(parsed).find(Array.isArray) || []);

        for (const item of items) {
          if (item && item.alt === '空き') {
            const dateStr = formatDate(item.useDay);
            const startStr = formatTime(item.startTime);
            const endStr = formatTime(item.endTime);
            
            if (dateStr && startStr && endStr) {
              parkVacantLines.push(`${dateStr} ${startStr}-${endStr}`);
            }
          }
        }
      } catch (parseError) {
        console.log('JSON PARSE ERROR: ' + parseError.message);
      }
    }

    // メール本文の各公園ブロックを組み立てる
    mailLines.push(`【${target.name}】\n`);
    if (parkVacantLines.length > 0) {
      mailLines.push(parkVacantLines.join('\n'));
      hasAnyVacant = true; // 空きが見つかったのでフラグを立てる
    } else {
      mailLines.push('空きなし');
    }
    mailLines.push('\n'); // 公園ごとの区切り改行

    await page.close();
  }

  await browser.close();

  // 空きが1件以上ある場合のみ、メールを送信する
  if (hasAnyVacant) {
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
      subject: 'テニスコート空き状況通知',
      text: mailLines.join('\n')
    });

    console.log('MAIL SENT');
  } else {
    console.log('NO VACANT COURTS - MAIL SKIPPED');
  }

})();
