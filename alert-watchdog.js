const http = require('http');
const https = require('https');

const TELEGRAM_URL = 'https://api.telegram.org/bot8290062040:AAGqu_UmREaDpB8UGye0VXDsVLeWYhiUBjY/sendMessage';
const CHAT_ID = '8063625960';

function sendAlert(message) {
  const payload = JSON.stringify({ chat_id: CHAT_ID, text: `🚨 MEP Dashboard Alert:\n\n${message}` });
  const req = https.request(TELEGRAM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  }, (res) => {
    res.on('data', () => {});
  });
  req.on('error', console.error);
  req.write(payload);
  req.end();
}

const reqModule = 'https://mepulse.co'.startsWith('https') ? https : http;
reqModule.get('https://mepulse.co', (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      sendAlert(`Site returned HTTP ${res.statusCode} instead of 200.`);
      process.exit(1);
    }
    if (!body.includes('Key Developments')) {
      sendAlert(`Site loaded but is missing expected content (UI rendering failed).`);
      process.exit(1);
    }
    console.log('WATCHDOG_OK - ' + new Date().toISOString());
  });
}).on('error', (e) => {
  sendAlert(`Site unreachable: ${e.message}`);
  process.exit(1);
});
