import { chromium } from "playwright";
import fs from "fs-extra";
import minimist from "minimist";

const BASE_URL = "https://app.silsilahku.com";

const SESSION_COOKIE = process.env.SESSION_COOKIE || "";

// ====== ARGUMENT PARSER ======
const args = minimist(process.argv.slice(2));
const startPage = parseInt(args.start);
const endPage = parseInt(args.end);

if (!startPage || !endPage || startPage > endPage) {
  console.log(`
Usage:
node scrapper.js --start=1 --end=5
`);
  process.exit(1);
}

(async () => {
  if (!SESSION_COOKIE) {
    console.error("SESSION_COOKIE belum diset. Jalankan dengan SESSION_COOKIE=<cookie> node scrapper.js ...");
    process.exit(1);
  }

  console.log(`🚀 Scraping from page ${startPage} to ${endPage}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addCookies([
    {
      name: "silsilahkucom_session",
      value: SESSION_COOKIE,
      domain: "app.silsilahku.com",
      path: "/",
      httpOnly: true,
      secure: true,
    },
  ]);

  const page = await context.newPage();
  const results = [];

  for (let p = startPage; p <= endPage; p++) {
    const url = `${BASE_URL}/masakhzab/det/gen/0?page=${p}`;
    console.log(`📄 Page ${p}`);

    await page.goto(url, { waitUntil: "networkidle" });

    const data = await page.evaluate(() => {
      function extractId(url) {
        if (!url) return null;
        const match = url.match(/profile\/(\d+)/);
        return match ? match[1] : null;
      }

      const cards = document.querySelectorAll(".col-lg-12.mb-3");

      const people = [];

      cards.forEach((el) => {
        const nameEl = el.querySelector("h4 a.h4");
        const profile_url = nameEl?.href || null;
        const name = nameEl?.innerText?.trim() || null;

        let father_url = null;
        let mother_url = null;

        const relationParagraphs = el.querySelectorAll("p.mb-0");

        relationParagraphs.forEach((p) => {
          if (p.innerText.includes("Anak Dari")) {
            const parents = p.querySelectorAll("a.text-info");

            if (parents[0]) father_url = parents[0].href;
            if (parents[1]) mother_url = parents[1].href;
          }
        });

        people.push({
          id: extractId(profile_url),
          name,
          url: profile_url,
          father_url,
          mother_url,
          spouse_urls: [],
          is_mantu: false,
        });
      });

      // ============================
      // SPOUSE DETECTION PASS
      // ============================

      const parentMap = new Map();

      people.forEach((p) => {
        if (p.father_url || p.mother_url) {
          const key = `${p.father_url || ""}-${p.mother_url || ""}`;

          if (!parentMap.has(key)) parentMap.set(key, []);
          parentMap.get(key).push(p);
        }
      });

      // If someone has no parent → mark mantu
      people.forEach((p) => {
        if (!p.father_url && !p.mother_url) {
          p.is_mantu = true;
        }
      });

      return people;
    });

    results.push(...data);
  }

  await browser.close();

  const filename = `output_${startPage}-${endPage}.json`;

  await fs.writeJson(filename, results, { spaces: 2 });

  console.log(`\n✅ DONE`);
  console.log(`📁 File saved: ${filename}`);
  console.log(`📊 Total data: ${results.length}\n`);
})();
