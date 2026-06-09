const nodemailer = require('nodemailer');

(async () => {
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
    subject: 'Tokyo Tennis Checker テスト',
    text: 'メール送信テスト成功'
  });

  console.log('MAIL SENT');
})();
