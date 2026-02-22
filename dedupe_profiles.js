import fs from "fs-extra";
import minimist from "minimist";
import { chromium } from "playwright";
import { JSDOM } from "jsdom";
import path from "path";
import { pathToFileURL } from "url";

const args = minimist(process.argv.slice(2));
const inputPath = args.input || "output_1-34.json";
const outputPath = args.output || "output_1-34.cleaned.json";
const headless = args.headless !== "false";
const sessionCookie =
  "eyJpdiI6IlZrN2l6b2lYVXlCUGtPOGxqZzVUUXc9PSIsInZhbHVlIjoiS3JIamp6dnl1UjVWZi95YVZoV0FvV0twdkR0dWhBQjhBSXdpWDRnWTN5NlMvVUw0bWJxMjd2clpmV01ZZWZhUVlSRTZmTE1BRkJ5bEVYUmhhYkdQamlCUWZmaERxTTBDN0VnL2sxbVpyQU5SM0FLWjMySi9STTYyMWlHbHFkUnoiLCJtYWMiOiJiNTliYzkyOTE0MDMwYzMzYzdmY2UxZjkyNjcwZGJlY2RhZDQ3NDE0MjgzNzFiM2E4ZjViZjIxZDdhNjhjNGI5In0=";

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeName = (name) =>
  normalizeText(name)
    .toLowerCase()
    .replace(/[.'’"]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getDirectText = (element) => {
  if (!element) {
    return "";
  }
  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent)
    .join(" ");
  return normalizeText(text);
};

const levenshteinDistance = (a, b) => {
  const first = a || "";
  const second = b || "";
  const firstLen = first.length;
  const secondLen = second.length;
  if (firstLen === 0) {
    return secondLen;
  }
  if (secondLen === 0) {
    return firstLen;
  }
  const matrix = Array.from({ length: firstLen + 1 }, () =>
    new Array(secondLen + 1).fill(0),
  );
  for (let i = 0; i <= firstLen; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= secondLen; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= firstLen; i += 1) {
    for (let j = 1; j <= secondLen; j += 1) {
      const cost = first[i - 1] === second[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[firstLen][secondLen];
};

const jaccardSimilarity = (a, b) => {
  const tokensA = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) {
    return 1;
  }
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }
  const intersection = new Set(
    [...tokensA].filter((token) => tokensB.has(token)),
  );
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
};

const nameSimilarity = (a, b) => {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.length < 4 || right.length < 4) {
    return 0;
  }
  const distance = levenshteinDistance(left, right);
  const maxLen = Math.max(left.length, right.length);
  const ratio = maxLen === 0 ? 0 : 1 - distance / maxLen;
  const tokenScore = jaccardSimilarity(left, right);
  return (ratio + tokenScore) / 2;
};

const parseProfileHtml = (html) => {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const h3 = document.querySelector("h3.text-dark");
  let name = getDirectText(h3);
  if (!name && h3) {
    name = normalizeText(h3.textContent);
  }

  let generation = "";
  const genLink = h3?.querySelector('a[href*="/det/gen/"]');
  if (genLink) {
    generation = normalizeText(genLink.textContent);
  } else if (h3) {
    const text = normalizeText(h3.textContent);
    const match = text.match(/G\d+/i);
    generation = match ? match[0].toUpperCase() : "";
  }

  let gender = "";
  const genderBadge = h3?.querySelector(".badge-info");
  const genderTitle = genderBadge?.getAttribute("title");
  if (genderTitle) {
    gender = normalizeText(genderTitle);
  } else if (genderBadge) {
    if (genderBadge.querySelector(".fa-mars")) {
      gender = "Laki Laki";
    } else if (genderBadge.querySelector(".fa-venus")) {
      gender = "Perempuan";
    }
  }

  const rows = new Map();
  document.querySelectorAll("table tr").forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 2) {
      return;
    }
    const label = normalizeText(tds[0].textContent);
    const value = normalizeText(tds[2]?.textContent || "");
    const links = Array.from(tds[2]?.querySelectorAll("a") || []).map(
      (link) => link.href,
    );
    if (label) {
      rows.set(label, { value, links });
    }
  });

  const ttl = rows.get("TTL")?.value || "";
  const status = rows.get("Status")?.value || "";
  const kondisi = rows.get("Kondisi")?.value || "";
  const address = rows.get("Alamat")?.value || "";
  const pekerjaan = rows.get("Pekerjaan")?.value || "";
  const menikah = rows.get("Menikah")?.value || "";
  const spouseUrls = rows.get("Pasangan")?.links || [];
  const parentUrls = rows.get("Anak Dari")?.links || [];

  return {
    name,
    generation,
    gender,
    ttl,
    status,
    kondisi,
    address,
    pekerjaan,
    menikah,
    spouse_urls: spouseUrls,
    father_url: parentUrls[0] || "",
    mother_url: parentUrls[1] || "",
  };
};

const isFilled = (value) => {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
};

const mergeProfile = (base, profile) => {
  const merged = { ...base };
  const fields = [
    "name",
    "gender",
    "generation",
    "ttl",
    "status",
    "kondisi",
    "address",
    "pekerjaan",
    "menikah",
  ];
  fields.forEach((field) => {
    if (isFilled(profile[field]) && !isFilled(merged[field])) {
      merged[field] = profile[field];
    }
  });

  if (isFilled(profile.father_url) && !isFilled(merged.father_url)) {
    merged.father_url = profile.father_url;
  }
  if (isFilled(profile.mother_url) && !isFilled(merged.mother_url)) {
    merged.mother_url = profile.mother_url;
  }

  if (Array.isArray(profile.spouse_urls) && profile.spouse_urls.length > 0) {
    const current = Array.isArray(merged.spouse_urls) ? merged.spouse_urls : [];
    merged.spouse_urls = Array.from(
      new Set([...current, ...profile.spouse_urls]),
    );
  }

  return merged;
};

const completenessScore = (item) => {
  const fields = [
    "name",
    "url",
    "father_url",
    "mother_url",
    "gender",
    "generation",
    "ttl",
    "status",
    "kondisi",
    "address",
    "pekerjaan",
    "menikah",
  ];
  let score = 0;
  fields.forEach((field) => {
    if (isFilled(item[field])) {
      score += 1;
    }
  });
  if (Array.isArray(item.spouse_urls) && item.spouse_urls.length > 0) {
    score += 1;
  }
  return score;
};

const resolveHtmlSource = async (url, page) => {
  if (!url) {
    return "";
  }
  const directPath = fs.existsSync(url) ? url : "";
  const resolvedPath =
    !directPath && fs.existsSync(path.resolve(url)) ? path.resolve(url) : "";
  if (directPath || resolvedPath) {
    return fs.readFile(directPath || resolvedPath, "utf8");
  }
  const targetUrl = url.startsWith("http") ? url : pathToFileURL(url).href;
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  return page.content();
};

const normalizeParentKey = (fatherUrl, motherUrl) => {
  const father = normalizeText(fatherUrl || "");
  const mother = normalizeText(motherUrl || "");
  return `${father}|${mother}`;
};

const groupByParents = (data) => {
  const parentGroups = new Map();
  data.forEach((item) => {
    const key = normalizeParentKey(item.father_url, item.mother_url);
    if (!parentGroups.has(key)) {
      parentGroups.set(key, []);
    }
    parentGroups.get(key).push(item);
  });
  return parentGroups;
};

const clusterByName = (items, threshold) => {
  const clusters = [];
  items.forEach((item) => {
    const itemName = item.name || "";
    let targetCluster = null;
    for (const cluster of clusters) {
      if (nameSimilarity(cluster.representativeName, itemName) >= threshold) {
        targetCluster = cluster;
        break;
      }
    }
    if (!targetCluster) {
      clusters.push({
        representativeName: itemName,
        items: [item],
      });
    } else {
      targetCluster.items.push(item);
    }
  });
  return clusters;
};

const main = async () => {
  const data = await fs.readJson(inputPath);
  if (!Array.isArray(data)) {
    throw new Error("Format JSON tidak valid.");
  }

  const parentGroups = groupByParents(data);
  const duplicates = [];

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
  const profileCache = new Map();

  const getProfile = async (url) => {
    if (!url) {
      return {};
    }
    if (profileCache.has(url)) {
      return profileCache.get(url);
    }
    const html = await resolveHtmlSource(url, page);
    const profile = parseProfileHtml(html);
    profileCache.set(url, profile);
    return profile;
  };

  const canonicalUrlByUrl = new Map();
  const canonicalDataByUrl = new Map();

  for (const group of parentGroups.values()) {
    if (group.length === 1) {
      continue;
    }
    const clusters = clusterByName(group, 0.85);
    for (const cluster of clusters) {
      if (cluster.items.length <= 1) {
        continue;
      }
      duplicates.push(cluster.items);
      const enriched = [];
      for (const item of cluster.items) {
        const profile = await getProfile(item.url);
        enriched.push(mergeProfile(item, profile));
      }
      enriched.sort((a, b) => completenessScore(b) - completenessScore(a));
      const selected = enriched[0];
      const canonicalUrl = selected.url;
      const existing = canonicalDataByUrl.get(canonicalUrl);
      canonicalDataByUrl.set(
        canonicalUrl,
        existing ? mergeProfile(existing, selected) : selected,
      );
      cluster.items.forEach((item) => {
        if (item.url && canonicalUrl && item.url !== canonicalUrl) {
          canonicalUrlByUrl.set(item.url, canonicalUrl);
        }
      });
      console.log(
        `Duplikat: ${normalizeName(cluster.items[0].name)} -> ${cluster.items.length} data, dipilih id ${selected.id || "-"}`,
      );
    }
  }

  const results = [];
  const seenUrls = new Set();
  data.forEach((item) => {
    const canonicalUrl = canonicalUrlByUrl.get(item.url) || item.url;
    if (!canonicalUrl) {
      if (!seenUrls.has(item.url)) {
        results.push(item);
        seenUrls.add(item.url);
      }
      return;
    }
    if (seenUrls.has(canonicalUrl)) {
      return;
    }
    const merged = canonicalDataByUrl.get(canonicalUrl) || item;
    results.push({ ...merged, url: canonicalUrl });
    seenUrls.add(canonicalUrl);
  });

  results.forEach((item) => {
    const father = item.father_url;
    const mother = item.mother_url;
    if (father && canonicalUrlByUrl.has(father)) {
      item.father_url = canonicalUrlByUrl.get(father);
    }
    if (mother && canonicalUrlByUrl.has(mother)) {
      item.mother_url = canonicalUrlByUrl.get(mother);
    }
  });

  await browser.close();

  await fs.writeJson(outputPath, results, { spaces: 2 });
  console.log(`Input: ${data.length} data`);
  console.log(`Duplikat: ${duplicates.length} nama`);
  console.log(`Output: ${results.length} data`);
  console.log(`File: ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
