import fs from "fs-extra";
import minimist from "minimist";
import { chromium } from "playwright";

const args = minimist(process.argv.slice(2));
const inputPath = args.input || "output_1-34.cleaned.json";
const outputPath = args.output || "output_1-34.with-images.json";
const headless = args.headless !== "false";
const sessionCookie = process.env.SESSION_COOKIE || "";

const normalizeUrl = (value) => String(value ?? "").trim();

const main = async () => {
  const data = await fs.readJson(inputPath);
  if (!Array.isArray(data)) {
    throw new Error("Format JSON tidak valid.");
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  if (sessionCookie) {
    await context.addCookies([
      {
        name: "silsilahkucom_session",
        value: sessionCookie,
        domain: "app.silsilahku.com",
        path: "/",
        httpOnly: true,
        secure: true,
      },
    ]);
  }
  const page = await context.newPage();
  const imageCache = new Map();

  const getImageUrl = async (url) => {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return "";
    }
    if (imageCache.has(normalized)) {
      return imageCache.get(normalized);
    }
    await page.goto(normalized, { waitUntil: "networkidle" });
    const imgUrl = await page.evaluate(() => {
      const img = document.querySelector(".col-lg-4 img");
      return img?.src || "";
    });
    imageCache.set(normalized, imgUrl || "");
    return imgUrl || "";
  };

  const results = [];
  for (const item of data) {
    const imgUrl = await getImageUrl(item.url);
    results.push({ ...item, img_url: imgUrl });
    console.log(`Image: ${item.name || "-"} -> ${imgUrl || "-"}`);
  }

  await browser.close();
  await fs.writeJson(outputPath, results, { spaces: 2 });
  console.log(`Input: ${data.length} data`);
  console.log(`Output: ${results.length} data`);
  console.log(`File: ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
