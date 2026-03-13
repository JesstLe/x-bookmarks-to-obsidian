import puppeteer from 'puppeteer-core';

const PORT = 9222;

async function run() {
  try {
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${PORT}`,
      defaultViewport: null
    });

    const page = await browser.newPage();
    // Go to profile directly
    await page.goto('https://x.com/profile', { waitUntil: 'networkidle2' });
    
    console.log('Navigated to profile. Waiting for timeline...');
    
    // Wait for tweets
    const selector = '[data-testid="tweet"]';
    try {
        await page.waitForSelector(selector, { timeout: 8000 });
    } catch(e) {
        console.log('No tweets found or loading slow.');
        await page.screenshot({ path: '/tmp/twitter_verify_fail.png' });
    }

    // Get first tweet text
    const firstTweet = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="tweet"] [data-testid="tweetText"]');
        return el ? el.innerText : "NO_TWEET_FOUND";
    });

    console.log('LATEST_TWEET: ' + firstTweet);
    await page.screenshot({ path: '/tmp/twitter_profile_verify.png' });

    await page.close();
    browser.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
