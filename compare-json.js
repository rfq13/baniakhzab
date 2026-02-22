import fs from "fs";

// Baca kedua file JSON
const withGender = JSON.parse(fs.readFileSync("./with-gender.json", "utf-8"));
const output = JSON.parse(fs.readFileSync("./output_1-34.json", "utf-8"));

console.log("=== PERBANDINGAN ARRAY ===\n");
console.log(`Panjang array with-gender.json: ${withGender.length}`);
console.log(`Panjang array output_1-34.json: ${output.length}`);
console.log(
  `Panjang array sama? ${withGender.length === output.length ? "✅ YA" : "❌ TIDAK"}`,
);

// Buat map berdasarkan ID untuk perbandingan
const withGenderMap = new Map(withGender.map((item) => [item.id, item]));
const outputMap = new Map(output.map((item) => [item.id, item]));

// Cek ID yang ada di with-gender tapi tidak di output
const onlyInWithGender = withGender.filter((item) => !outputMap.has(item.id));
console.log(
  `\nID yang hanya ada di with-gender.json: ${onlyInWithGender.length}`,
);
if (onlyInWithGender.length > 0) {
  console.log("ID:", onlyInWithGender.map((i) => i.id).join(", "));
}

// Cek ID yang ada di output tapi tidak di with-gender
const onlyInOutput = output.filter((item) => !withGenderMap.has(item.id));
console.log(`\nID yang hanya ada di output_1-34.json: ${onlyInOutput.length}`);
if (onlyInOutput.length > 0) {
  console.log("ID:", onlyInOutput.map((i) => i.id).join(", "));
}

// Bandingkan nilai untuk ID yang sama
console.log("\n=== PERBANDINGAN NILAI ===\n");

const differences = [];
const commonIds = withGender
  .filter((item) => outputMap.has(item.id))
  .map((item) => item.id);

for (const id of commonIds) {
  const wgItem = withGenderMap.get(id);
  const outItem = outputMap.get(id);

  // Key yang ada di kedua object
  const allKeys = new Set([...Object.keys(wgItem), ...Object.keys(outItem)]);

  for (const key of allKeys) {
    const wgVal = wgItem[key];
    const outVal = outItem[key];

    // Handle array comparison
    if (Array.isArray(wgVal) && Array.isArray(outVal)) {
      if (JSON.stringify(wgVal) !== JSON.stringify(outVal)) {
        differences.push({
          id,
          key,
          withGender: wgVal,
          output: outVal,
        });
      }
    } else if (wgVal !== outVal) {
      differences.push({
        id,
        key,
        withGender: wgVal,
        output: outVal,
      });
    }
  }
}

console.log(`Total perbedaan nilai: ${differences.length}`);

if (differences.length > 0) {
  console.log("\n=== DETAIL PERBEDAAN ===\n");

  // Group by ID
  const diffById = {};
  for (const diff of differences) {
    if (!diffById[diff.id]) diffById[diff.id] = [];
    diffById[diff.id].push(diff);
  }

  console.log(`Jumlah ID dengan perbedaan: ${Object.keys(diffById).length}`);

  // Tampilkan beberapa contoh perbedaan
  const sampleIds = Object.keys(diffById).slice(0, 10);
  console.log("\nContoh perbedaan (10 ID pertama):");

  for (const id of sampleIds) {
    console.log(`\n--- ID: ${id} ---`);
    for (const diff of diffById[id]) {
      console.log(`  Key: ${diff.key}`);
      console.log(`    with-gender: ${JSON.stringify(diff.withGender)}`);
      console.log(`    output: ${JSON.stringify(diff.output)}`);
    }
  }

  // Ringkasan perbedaan per key
  console.log("\n=== RINGKASAN PERBEDAAN PER KEY ===\n");
  const diffByKey = {};
  for (const diff of differences) {
    if (!diffByKey[diff.key]) diffByKey[diff.key] = 0;
    diffByKey[diff.key]++;
  }

  for (const [key, count] of Object.entries(diffByKey).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`${key}: ${count} perbedaan`);
  }
}

// Cek key yang berbeda
console.log("\n=== PERBANDINGAN STRUKTUR KEY ===\n");

const wgKeys = new Set();
const outKeys = new Set();

withGender.forEach((item) => Object.keys(item).forEach((k) => wgKeys.add(k)));
output.forEach((item) => Object.keys(item).forEach((k) => outKeys.add(k)));

const onlyWgKeys = [...wgKeys].filter((k) => !outKeys.has(k));
const onlyOutKeys = [...outKeys].filter((k) => !wgKeys.has(k));

console.log(
  `Key hanya di with-gender.json: ${onlyWgKeys.join(", ") || "(tidak ada)"}`,
);
console.log(
  `Key hanya di output_1-34.json: ${onlyOutKeys.join(", ") || "(tidak ada)"}`,
);
