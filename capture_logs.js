const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[CLIENT VOICE]') || text.includes('[VOICE]')) {
          console.log(text);
      }
  });

  await page.goto('http://localhost:3000');
  
  try {
      // Find the orb/voice mode button
      await page.waitForSelector('button', { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          // Click any button that might be the voice trigger
          const vBtn = btns.find(b => 
              (b.textContent && b.textContent.includes('Voice')) || 
              (b.title && b.title.includes('Voice')) ||
              (b.className && b.className.includes('fixed')) // The floating orb is often fixed
          );
          if (vBtn) vBtn.click();
      });
      
      // Wait for session to start, stream audio, etc.
      await new Promise(r => setTimeout(r, 6000));
      
      // Stop voice mode to trigger close
      await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const closeBtn = btns.find(b => b.title && b.title.includes('Close'));
          if (closeBtn) closeBtn.click();
      });
      
      await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
      console.log('Error interacting:', e);
  }
  
  await browser.close();
})();
