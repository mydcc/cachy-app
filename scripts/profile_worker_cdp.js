
import puppeteer from 'puppeteer';

// Check if URL is provided, else default
const TARGET_URL = process.argv[2] || 'http://localhost:5173';

async function runProfile() {
  console.log(`Starting Profiler on ${TARGET_URL}...`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (e) {
    console.error("Failed to launch Puppeteer. Please run: npm install puppeteer");
    process.exit(1);
  }

  const page = await browser.newPage();

  // 1. Setup CDP Session
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');
  await client.send('Runtime.enable');

  // 2. Worker Detection
  const workers = new Map();

  browser.on('targetcreated', async (target) => {
    if (target.type() === 'worker') {
      console.log(`[Worker Detected] ${target.url()}`);
      const workerSession = await target.createCDPSession();
      await workerSession.send('Runtime.enable');

      // Inject Instrumentation
      await workerSession.send('Runtime.evaluate', {
        expression: `
          (() => {
            self.__msgCount = 0;
            const originalPost = self.postMessage;
            self.postMessage = function(...args) {
              self.__msgCount++;
              return originalPost.apply(this, args);
            };
            // Listen for incoming
            self.addEventListener('message', () => {
               self.__msgCount++;
            });
          })();
        `
      });

      workers.set(target.url(), {
        session: workerSession,
        lastCount: 0
      });
    }
  });

  // 3. Inject Event Loop Lag Meter into the Main Thread
  await page.evaluateOnNewDocument(() => {
    window.__eventLoopLag = 0;
    let lastTime = performance.now();

    // Measure lag every 100ms
    setInterval(() => {
      const now = performance.now();
      const delta = now - lastTime;
      const lag = delta - 100; // Expected 100ms
      window.__eventLoopLag = Math.max(0, lag);
      lastTime = now;
    }, 100);
  });

  console.log("Navigating...");
  await page.goto(TARGET_URL);

  console.log("Profiling for 10 seconds...");

  // Poll metrics
  const metrics = [];
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));

    // Get metrics from page
    const lag = await page.evaluate(() => window.__eventLoopLag);
    const perf = await client.send('Performance.getMetrics');

    // Extract relevant metrics
    const jsHeap = perf.metrics.find(m => m.name === 'JSHeapUsedSize')?.value;

    // Get Worker Metrics
    let totalThroughput = 0;
    for (const [url, worker] of workers.entries()) {
        try {
            const res = await worker.session.send('Runtime.evaluate', {
                expression: 'self.__msgCount',
                returnByValue: true
            });
            const currentCount = res.result.value || 0;
            const delta = currentCount - worker.lastCount;
            totalThroughput += delta;
            worker.lastCount = currentCount;
        } catch (e) {
            // Worker might have died
        }
    }

    metrics.push({
      timestamp: Date.now(),
      lag,
      jsHeap,
      throughput: totalThroughput
    });

    console.log(`[${i}s] Lag: ${lag.toFixed(2)}ms | Heap: ${(jsHeap / 1024 / 1024).toFixed(1)}MB | Msgs/sec: ${totalThroughput}`);
  }

  console.log("\n--- Profiling Report ---");
  const avgLag = metrics.reduce((acc, m) => acc + m.lag, 0) / metrics.length;
  const avgTput = metrics.reduce((acc, m) => acc + m.throughput, 0) / metrics.length;

  console.log(`Average Event Loop Lag: ${avgLag.toFixed(2)}ms`);
  console.log(`Average Message Throughput: ${avgTput.toFixed(1)} msgs/sec`);

  if (avgLag > 20) {
    console.log("CRITICAL: High Event Loop Lag detected (>20ms). UI jank likely.");
  } else {
    console.log("STATUS: Event Loop Lag within acceptable limits.");
  }

  console.log(`Workers Active: ${workers.size}`);

  await browser.close();
}

runProfile().catch(console.error);
