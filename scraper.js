const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

const LOCATIONS = ['500072', '500007', '500008', '500004'];
const SEARCH_TERM = 'maagaani';
const ALERT_EMAIL = 'kmadhav03@gmail.com';

async function checkLocation(page, pincode) {
  // Set delivery location
  await page.goto('https://blinkit.com');
  await page.getByText('Delivery in').click();
  await page.locator('input[name="select-locality"]').waitFor({ state: 'visible' });
  console.log('pin code textbox is visible');
  await page.locator('input[name="select-locality"]').fill(pincode);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);

  // Search for product
  await page.fill('input[type="search"]', SEARCH_TERM);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  // Check for out-of-stock items
  const products = await page.$$eval('.product-card', cards =>
    cards.map(card => ({
      name: card.querySelector('.product-name')?.innerText,
      outOfStock: !!card.querySelector('.out-of-stock') // selector may vary
    }))
  );

  return products.filter(p => p.outOfStock);
}

async function sendEmail(outOfStockMap) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_ADDRESS,
      pass: process.env.GMAIL_APP_PASSWORD  // use App Password, not real password
    }
  });

  const body = Object.entries(outOfStockMap)
    .map(([pin, items]) => `📍 ${pin}:\n${items.map(i => `  - ${i.name}`).join('\n')}`)
    .join('\n\n');

  await transporter.sendMail({
    from: process.env.GMAIL_ADDRESS,
    to: process.env.GMAIL_ADDRESS,
    subject: `Blinkit Out-of-Stock Alert: ${SEARCH_TERM}`,
    text: body || 'All items are in stock!'
  });
}

(async () => {
  const browser = await chromium.launch({headless: false, slowMo: 1000});
  // how to run this headed 
  const outOfStockMap = {};

  for (const pincode of LOCATIONS) {
    const page = await browser.newPage();
    const outOfStock = await checkLocation(page, pincode);
    if (outOfStock.length > 0) outOfStockMap[pincode] = outOfStock;
    await page.close();
  }

  await browser.close();
  await sendEmail(outOfStockMap);
})();