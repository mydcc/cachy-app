import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const logStream = fs.createWriteStream('verification_log.txt', { flags: 'a' });
  const log = (msg) => {
    console.log(msg);
    logStream.write(msg + '\n');
  };

  log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Capture console logs
    page.on('console', msg => log('BROWSER LOG: ' + msg.text()));
    page.on('pageerror', err => log('BROWSER JS ERROR: ' + err.toString()));
    page.on('requestfailed', req => log('REQUEST FAILED: ' + req.url() + ' ' + (req.failure() ? req.failure().errorText : '')));

    // Inject settings before navigation
    await page.evaluateOnNewDocument(() => {
        const settings = {
            backgroundType: 'tradeflow',
            disclaimerAccepted: true,
            showSidebars: true,
            tradeFlowSettings: {
                flowMode: 'sonar',
                gridWidth: 80,
                gridLength: 160,
                enableAtmosphere: true,

            }
        };
        localStorage.setItem('cryptoCalculatorSettings', JSON.stringify(settings));
    });

    log('Navigating to app (Dev Server)...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 });
    log('Page loaded. URL: ' + page.url());

    // Wait for the container
    log('Waiting for TradeFlow container (30s)...');
    try {
        await page.waitForSelector('.trade-flow-container', { timeout: 30000 });
    } catch (e) {
        log('Wait for .trade-flow-container failed.');
        await page.screenshot({ path: 'debug_failure.png' });
        const bodyHandler = await page.$('body');
        const bodyHtml = await page.evaluate(body => body.innerHTML, bodyHandler);
        log('PAGE BODY INNERHTML: ' + bodyHtml);
        throw e;
    }

    const canvas = await page.$('.trade-flow-container canvas');
    if (!canvas) throw new Error('Canvas element not found inside container');

    const box = await canvas.boundingBox();
    log(`Canvas detected: ${box.width}x${box.height}`);

    if (box.width === 0 || box.height === 0) {
      throw new Error('Canvas has zero dimensions');
    }

    // Wait for initialization
    await new Promise(r => setTimeout(r, 2000));

    log('Injecting Mock Trades to verify Rendering via __injectTrade...');
    await page.evaluate(() => {
        if (window.__injectTrade) {
            console.log('Injecting 50 random trades...');
            for (let i = 0; i < 50; i++) {
                window.__injectTrade({
                    side: Math.random() > 0.5 ? 'buy' : 'sell',
                    price: 90000 + Math.random() * 100,
                    size: 0.5 + Math.random() * 5
                });
            }
        } else {
            console.error('__injectTrade hook NOT found!');
        }
    });
    
    // Check if we can find the canvas content
    const dataUrl = await page.evaluate(() => {
        const c = document.querySelector('.trade-flow-container canvas');
        return c ? c.toDataURL() : null;
    });

    if (!dataUrl || dataUrl.length < 1000) {
       throw new Error('Canvas snapshot empty');
    }
    
    log('Screenshot taken (checking for content)...');
    await page.screenshot({ path: 'verification_result.png' });
    
    log('✅ TradeFlow Verification Passed: Canvas active. (Note: Real trades require working Websocket)');

  } catch (e) {
    log('❌ Verification Failed: ' + e);
    process.exit(1);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();
