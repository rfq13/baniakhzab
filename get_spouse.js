import { chromium } from "playwright";
import fs from "fs-extra";
import minimist from "minimist";

const BASE_DOMAIN = "app.silsilahku.com";

async function createBrowser(headless = true, sessionCookie = null) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();

  if (sessionCookie) {
    await context.addCookies([
      {
        name: "silsilahkucom_session",
        value: sessionCookie,
        domain: BASE_DOMAIN,
        path: "/",
        httpOnly: true,
        secure: true,
      },
    ]);
  }

  const page = await context.newPage();
  return { browser, context, page };
}

async function scrapeSpouseUrls(page, profileUrl, profileCache) {
  // ✅ Cache check
  if (profileCache.has(profileUrl)) {
    const cachedData = profileCache.get(profileUrl);
    return {
      spouses: cachedData.spouses,
      img_url: cachedData.img_url,
    };
  }

  await page.goto(profileUrl, { waitUntil: "networkidle" });

  const table = await page.$("table");
  if (!table) {
    profileCache.set(profileUrl, { spouses: [], img_url: "" });
    return { spouses: [], img_url: "" };
  }

  const spouseUrls = await page.evaluate(() => {
    const result = new Set();

    const currentUrl = window.location.href;
    const match = currentUrl.match(/profile\/(\d+)\//);
    const currentId = match ? match[1] : null;

    const links = document.querySelectorAll("a[href*='/det/profile/']");

    links.forEach((a) => {
      const href = a.href;

      const m = href.match(/profile\/(\d+)\//);
      if (!m) return;

      const targetId = m[1];

      if (targetId === currentId) return;

      const parentRow = a.closest("tr");

      if (parentRow?.innerText?.toLowerCase().includes("pasangan")) {
        result.add(href);
      }
    });

    const img_url =
      document.querySelector(
        "body > div.content.p-0 > div > div:nth-child(3) > div.col-lg-12 > div > div > div > div > div.col-lg-4.col-md-8.col-sm-12.mb-3 > img",
      )?.src || "";

    return { spouses: Array.from(result), img_url };
  });

  profileCache.set(profileUrl, spouseUrls);

  return {
    spouses: spouseUrls.spouses,
    img_url: spouseUrls.img_url,
  };
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const inputPath = args.input || "output_1-34.with-images.json";
  const outputPath = args.output || "output_1-34.with-spouse.json";
  const headless = args.headless !== "false";
  const sessionCookie =
    "eyJpdiI6Im0rR0g0RXdMLzRDWEIyc2dTOFk2ekE9PSIsInZhbHVlIjoiYWJLTytSV2pqWWlDS25CLys2R1VjUUlkNWI2a0hJNVJiOTd2VU8xSzBJUVBjY1dmMUNxemhFUEpyeWlsVGJqSlpGNkNqQk5DbnM4Yk45ZW5aWU5GdEpHQkdLVUZxeDJId05KN09MWkxFY1hSd1ZtZmNIbEMyMjhlYWJXTDVtL3oiLCJtYWMiOiI4ZmJjMTNkNWJiZmIwZjZlNjcwMjM5OWY0ZGM3ZjBhNzkzYWJmMDliMjg4MzZiMzI3NjkyMmEwMTE4MmJlYzQ0In0%3D";

  const data = await fs.readJson(inputPath);
  if (!Array.isArray(data)) {
    throw new Error("Format JSON tidak valid.");
  }

  const profileCache = new Map();

  let browser;
  let page;

  const boot = async () => {
    const created = await createBrowser(headless, sessionCookie);
    browser = created.browser;
    page = created.page;
  };

  const ensurePage = async () => {
    if (!browser || !browser.isConnected() || !page || page.isClosed()) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      await boot();
    }
  };

  await boot();

  try {
    const results = [];
    for (const item of data) {
      const profileUrl = String(item?.url || "").trim();
      let spouseUrls = Array.isArray(item?.spouse_urls) ? item.spouse_urls : [];
      if (profileUrl) {
        try {
          await ensurePage();
          const spouseData = await scrapeSpouseUrls(
            page,
            profileUrl,
            profileCache,
          );
          spouseUrls = spouseData.spouses;
          item.img_url = spouseData.img_url;
        } catch (error) {
          const message = error?.message || String(error);
          console.error(`Gagal ambil pasangan: ${profileUrl} -> ${message}`);
          if (message.includes("Target page") || message.includes("browser")) {
            if (browser) {
              await browser.close().catch(() => {});
            }
            browser = null;
            page = null;
          }
        }
      }
      results.push({ ...item, spouse_urls: spouseUrls });
      console.log(`Spouse: ${item?.name || "-"} -> ${spouseUrls.length}`);
    }

    await fs.writeJson(outputPath, results, { spaces: 2 });
    console.log(`Input: ${data.length} data`);
    console.log(`Output: ${results.length} data`);
    console.log(`File: ${outputPath}`);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
