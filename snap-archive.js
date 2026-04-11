const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('https://war.hmviva.us/archive.html#2026-04-11', { waitUntil: 'networkidle2', timeout: 15000 });
  // Wait for JS rendering
  await new Promise(r => setTimeout(r, 2000));
  // Take a full page screenshot
  await page.screenshot({ path: '/Users/michaelmatias/.openclaw/media/war-archive.png', fullPage: true });
  console.log('Screenshot saved to war-archive.png');
  await browser.close();
  process.exit(0);
})();
