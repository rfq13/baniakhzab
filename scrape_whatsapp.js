import fs from 'fs-extra';
import minimist from 'minimist';
import { chromium } from 'playwright';

const args = minimist(process.argv.slice(2));
const inputPath = args.input || 'with-gender.json';
const outputPath = args.output || 'with-whatsapp.json';
const headless = args.headless !== 'false';
const sessionCookie =
  'eyJpdiI6IjJKWmRoOG5OOWFpQVlkSlpsQnIxUlE9PSIsInZhbHVlIjoiR1JKMU5qTmR5SlRJYm45d1pLK0pVZ0VHam4yVnZEV25wZW1ITVVEbU5ZVkJ1NCtHRDFmb0x2QThqWVQxb1NvcytMS3g2c215cC8raVZyYnNZdHpHT3p6Y21kRGhUd3ZialBmMWQ4MWxianVrY1QzMkYyN1Z1RkxJcFp0RTZEWHoiLCJtYWMiOiI0OTFjYTdhOTQ1Y2M3YjhmNDliNDQzNDFlYmY5YTM0NmQwZTYzYjFhYjQxYmQ1MDdiMjgwYjk0NDc3OTRiMzEzIn0%3D';

const normalizeUrl = (value) => String(value ?? '').trim();

const main = async () => {
  if (!(await fs.pathExists(inputPath))) {
    console.error(`File input ${inputPath} tidak ditemukan.`);
    process.exit(1);
  }

  const data = await fs.readJson(inputPath);
  if (!Array.isArray(data)) {
    throw new Error('Format JSON tidak valid.');
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();

  // Tambahkan cookie jika ada (sama seperti script image scraper sebelumnya)
  if (sessionCookie) {
    await context.addCookies([
      {
        name: 'silsilahkucom_session',
        value: sessionCookie,
        domain: 'app.silsilahku.com',
        path: '/',
        httpOnly: true,
        secure: true,
      },
    ]);
  }

  const page = await context.newPage();
  const whatsappCache = new Map();

  const getWhatsAppLink = async (url) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return '';

    if (whatsappCache.has(normalized)) {
      return whatsappCache.get(normalized);
    }

    try {
      console.log(`Navigating to: ${normalized}`);
      await page.goto(normalized, { waitUntil: 'networkidle', timeout: 30000 });

      const selector =
        'body > div.content.p-0 > div > div:nth-child(3) > div.col-lg-12 > div > div > div > div > div.col-lg-4.col-md-8.col-sm-12.mb-3 > span:nth-child(1) > a.btn.btn-sm.btn-success.ml-auto';

      const waLink = await page.evaluate((sel) => {
        const anchor = document.querySelector(sel);
        return anchor ? anchor.href : '';
      }, selector);

      whatsappCache.set(normalized, waLink || '');
      return waLink || '';
    } catch (error) {
      console.error(
        `Gagal mengambil data dari ${normalized}: ${error.message}`
      );
      return '';
    }
  };

  const results = [];
  let count = 0;
  const total = data.length;

  for (const item of data) {
    count++;
    const waLink = await getWhatsAppLink(item.url);
    results.push({ ...item, whatsapp_link: waLink });
    console.log(
      `[${count}/${total}] WA: ${item.name || '-'} -> ${waLink || 'Tidak ditemukan'}`
    );
  }

  await browser.close();
  await fs.writeJson(outputPath, results, { spaces: 2 });

  console.log('\n--- Selesai ---');
  console.log(`Input: ${data.length} data`);
  console.log(`Output: ${results.length} data`);
  console.log(`File tersimpan di: ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
