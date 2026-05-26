require('dotenv').config();
const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

const PIN_CODES = ['500033', '500034', '500072', '500016', '500060', '500003', '500081', '500028', '500002', '500029'];
// products will be discovered dynamically from search results
const RECIPIENTS = ['dearvenumadhav@gmail.com', 'kmadhav03@gmail.com', 'bsateesh@gmail.com'];

const GMAIL_ADDRESS = process.env.GMAIL_ADDRESS;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_ADDRESS || !GMAIL_APP_PASSWORD) {
  console.error('Missing GMAIL_ADDRESS or GMAIL_APP_PASSWORD environment variables.');
  process.exit(1);
}

async function waitForLocationOverlay(page) {
  await page.waitForTimeout(1000);
  const overlay = page.locator('.LocationDropDown__LocationOverlay-sc-bx29pc-1, .SearchBarContainer__Container-sc-hl8pft-0');
  try {
    await overlay.waitFor({ state: 'hidden', timeout: 15000 });
  } catch (e) {
    // ignore if the overlay never disappears and continue with the flow
  }
}

async function checkPinCode(pinCode) {
  const browser = await chromium.launch({ headless: false});
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://blinkit.com/s/?q=maagaani', { waitUntil: 'networkidle' });
  // reliable selector for Blinkit delivery input
  const locationInput = 'input[name="select-locality"], input[placeholder="search delivery location"]';
  await page.waitForSelector(locationInput, { timeout: 30000 });

  await page.click(locationInput);
  await page.fill(locationInput, pinCode);
  await page.waitForTimeout(500);

  const suggestion = page.locator(`text=${pinCode}`).first();
  if (await suggestion.count()) {
    await suggestion.click({ timeout: 10000 });
    await waitForLocationOverlay(page);
  }

  // robust click for the Maagaani brand result: find first matching button, scroll then click
  const maagaaniLocator = page.locator('div[role="button"]', { hasText: 'Maagaani' }).first();
  //await page.pause(); // for debugging
  if (await maagaaniLocator.count()) {
    await maagaaniLocator.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await maagaaniLocator.scrollIntoViewIfNeeded().catch(() => {});
    await maagaaniLocator.click({ timeout: 10000 }).catch(() => {});
  }

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // discover product cards on the page and check ADD button presence
  const productHandles = await page.locator('div[role="button"][id]').elementHandles();
  const products = [];
  for (const handle of productHandles) {
    try {
      const info = await handle.evaluate((node) => {
        // attempt to find a product name element inside the card
        const nameSelectors = [
          '.tw-text-300.tw-font-semibold.tw-line-clamp-2',
          '.tw-text-400.tw-font-semibold',
          '.tw-line-clamp-1',
          '.tw-font-medium',
          '.tw-text-grey-700',
        ];
        let name = null;
        for (const sel of nameSelectors) {
          const el = node.querySelector(sel);
          if (el && el.innerText && el.innerText.trim()) {
            name = el.innerText.trim();
            break;
          }
        }
        // fallback: first significant text node
        if (!name) {
          const text = node.innerText || '';
          name = text.split('\n').map(s => s.trim()).find(Boolean) || 'Unknown product';
        }
        // detect ADD button inside the card
        const addEls = Array.from(node.querySelectorAll('div[role="button"], button'));
        const inStock = addEls.some(el => (el.textContent || '').trim().toUpperCase().includes('ADD'));
        return { name, inStock };
      });
      // filter out non-product labels and metadata
      const nonProductPatterns = /^(Showing|Related|Out of|In|%|OFF|\d+\s*mins)/i;
      // only include products starting with "Maagaani" (case insensitive)
      const isMaagaaniProduct = /^maagaani/i.test(info.name);
      if (!nonProductPatterns.test(info.name) && isMaagaaniProduct) {
        products.push(info);
      }
    } catch (e) {
      // ignore evaluation errors per card
    }
  }

  await browser.close();
  return products;
}

function buildEmailBody(results) {
  let body = 'Blinkit Maagaani stock report\n\n';
  for (const { pinCode, products } of results) {
    body += `${pinCode}:\n`;
    for (const p of products) {
      body += ` - ${p.name}: ${p.inStock ? 'IN STOCK' : 'OUT OF STOCK'}\n`;
    }
    body += '\n';
  }
  return body;
}

async function sendReport(results) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_ADDRESS,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  const outOfStockTotal = results.some((entry) => entry.products && entry.products.some(p => !p.inStock));
  const subject = outOfStockTotal
    ? 'Blinkit stock monitor: out of stock items found'
    : 'Blinkit stock monitor: all products available';

  await transporter.sendMail({
    from: GMAIL_ADDRESS,
    to: RECIPIENTS.join(','),
    subject,
    text: buildEmailBody(results),
  });
}

async function main() {
  const results = [];
  for (const pinCode of PIN_CODES) {
    console.log(`Checking pin code ${pinCode}...`);
    const products = await checkPinCode(pinCode);
    const out = products.filter(p => !p.inStock).map(p => p.name);
    console.log(` ${pinCode} out of stock:`, out.length ? out : 'none');
    results.push({ pinCode, products });
  }

  await sendReport(results);
  console.log('Email sent to', RECIPIENTS.join(', '));
}

main().catch((error) => {
  console.error('Stock monitor failed:', error);
  process.exit(1);
});
