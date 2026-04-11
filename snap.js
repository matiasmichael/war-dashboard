const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('https://war.hmviva.us', { waitUntil: 'networkidle2', timeout: 15000 });
  await page.screenshot({ path: '/Users/michaelmatias/.openclaw/media/war-mobile.png' });
  await browser.close();
  process.exit(0);
})();
