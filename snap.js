const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  
  // Screenshot 1: Archive page (Daily Briefing)
  const archivePage = await browser.newPage();
  await archivePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await archivePage.goto('https://war.hmviva.us/archive/', { waitUntil: 'networkidle2', timeout: 20000 });
  // Wait a bit for briefing to load
  await new Promise(r => setTimeout(r, 2000));
  await archivePage.screenshot({ path: '/Users/michaelmatias/.openclaw/media/war-archive.png', fullPage: true });
  console.log('✅ Archive screenshot saved: war-archive.png');

  // Screenshot 2: Main page (Live Feed)
  const mainPage = await browser.newPage();
  await mainPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mainPage.goto('https://war.hmviva.us', { waitUntil: 'networkidle2', timeout: 15000 });
  await mainPage.screenshot({ path: '/Users/michaelmatias/.openclaw/media/war-mobile.png' });
  console.log('✅ Main page screenshot saved: war-mobile.png');

  await browser.close();
  process.exit(0);
})();
