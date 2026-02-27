// Replicate the seed logic: map JSON.id -> DB.id, then verify relationships
const fs = require('fs');
const jsonData = JSON.parse(fs.readFileSync('d:/Ngoding/expr/baniakhzab/with-gender.json', 'utf8'));
const dbData = JSON.parse(fs.readFileSync('C:/Users/Fakhrul/.gemini/antigravity/brain/bb1eb383-c212-4760-bbf7-859d93bf44a5/.system_generated/steps/479/output.txt', 'utf8'));

// The seeder processes JSON in order and inserts sequentially.
// DB IDs are auto-increment. So JSON[0]->DB first inserted, JSON[1]->DB second, etc.
// This means the mapping is: jsonData[i] -> dbData[i] (by insertion order)

// But JSON entries are in reverse order (736, 735, 734...) and DB IDs are ascending (1281, 1282, 1283...)
// So jsonData[0] (id=736) -> dbData[0] (id=1281), jsonData[1] (id=735) -> dbData[1] (id=1282), etc.

const output = [];

// Build JSON-ID -> DB-ID mapping based on array position
const jsonIdToDbId = {};
const dbIdToJsonId = {};
for (let i = 0; i < jsonData.length && i < dbData.length; i++) {
    jsonIdToDbId[jsonData[i].id] = dbData[i].id;
    dbIdToJsonId[dbData[i].id] = jsonData[i].id;
}

// Extract profile ID from URL
function extractProfId(url) {
    if (!url) return null;
    const m = url.match(/profile\/(\d+)\//);
    return m ? m[1] : null;
}

// Count issues
let fatherFixes = [];
let motherFixes = [];
let spouseFixes = [];
let nameFixes = [];
let genderFixes = [];
let urlFixes = [];

for (let i = 0; i < jsonData.length && i < dbData.length; i++) {
    const jp = jsonData[i];
    const dp = dbData[i];

    // Name
    if (jp.name !== dp.full_name) {
        nameFixes.push({ db_id: dp.id, json: jp.name, db: dp.full_name });
    }

    // Gender
    if (jp.gender !== dp.gender) {
        genderFixes.push({ db_id: dp.id, json: jp.gender, db: dp.gender });
    }

    // URL
    if (jp.url !== dp.url) {
        urlFixes.push({ db_id: dp.id, json: jp.url, db: dp.url });
    }

    // Father
    const fatherProfId = jp.father_url ? extractProfId(jp.father_url) : null;
    const expectedFatherId = fatherProfId ? (jsonIdToDbId[fatherProfId] || null) : null;
    const actualFatherId = dp.father_id || null;
    if (String(expectedFatherId || '') !== String(actualFatherId || '')) {
        fatherFixes.push({ name: dp.full_name, db_id: dp.id, expected: expectedFatherId, actual: actualFatherId, jsonFatherUrl: jp.father_url });
    }

    // Mother
    const motherProfId = jp.mother_url ? extractProfId(jp.mother_url) : null;
    const expectedMotherId = motherProfId ? (jsonIdToDbId[motherProfId] || null) : null;
    const actualMotherId = dp.mother_id || null;
    if (String(expectedMotherId || '') !== String(actualMotherId || '')) {
        motherFixes.push({ name: dp.full_name, db_id: dp.id, expected: expectedMotherId, actual: actualMotherId, jsonMotherUrl: jp.mother_url });
    }

    // Spouses
    const expectedSpouseIds = (jp.spouse_urls || [])
        .map(u => { const pid = extractProfId(u); return pid ? jsonIdToDbId[pid] : null; })
        .filter(Boolean)
        .sort((a, b) => a - b);
    const actualSpouseIds = (dp.spouse_ids || []).sort((a, b) => a - b);
    if (JSON.stringify(expectedSpouseIds) !== JSON.stringify(actualSpouseIds)) {
        spouseFixes.push({ name: dp.full_name, db_id: dp.id, expected: expectedSpouseIds, actual: actualSpouseIds });
    }
}

output.push('=== SYNC REPORT (using positional mapping) ===');
output.push(`JSON entries: ${jsonData.length}, DB entries: ${dbData.length}`);
output.push(`Name mismatches: ${nameFixes.length}`);
output.push(`Gender mismatches: ${genderFixes.length}`);
output.push(`URL mismatches: ${urlFixes.length}`);
output.push(`Wrong father_id: ${fatherFixes.length}`);
output.push(`Wrong mother_id: ${motherFixes.length}`);
output.push(`Wrong spouse_ids: ${spouseFixes.length}`);

if (nameFixes.length > 0) {
    output.push('\n--- Name Mismatches ---');
    nameFixes.forEach(f => output.push(`  DB id=${f.db_id}: JSON="${f.json}" vs DB="${f.db}"`));
}
if (urlFixes.length > 0) {
    output.push('\n--- URL Mismatches ---');
    urlFixes.forEach(f => output.push(`  DB id=${f.db_id}: JSON="${f.json}" vs DB="${f.db}"`));
}
if (fatherFixes.length > 0) {
    output.push('\n--- Wrong Father ---');
    fatherFixes.forEach(f => output.push(`  ${f.name} (${f.db_id}): expected=${f.expected}, actual=${f.actual} [json_url=${f.jsonFatherUrl}]`));
}
if (motherFixes.length > 0) {
    output.push('\n--- Wrong Mother ---');
    motherFixes.forEach(f => output.push(`  ${f.name} (${f.db_id}): expected=${f.expected}, actual=${f.actual} [json_url=${f.jsonMotherUrl}]`));
}
if (spouseFixes.length > 0) {
    output.push('\n--- Wrong Spouse ---');
    spouseFixes.forEach(f => output.push(`  ${f.name} (${f.db_id}): expected=[${f.expected}], actual=[${f.actual}]`));
}

// Generate SQL
let sql = [];
for (const f of urlFixes) {
    sql.push(`UPDATE persons SET url = '${f.json}' WHERE id = ${f.db_id};`);
}
for (const f of nameFixes) {
    sql.push(`UPDATE persons SET full_name = '${f.json.replace(/'/g, "''")}' WHERE id = ${f.db_id};`);
}
for (const f of genderFixes) {
    sql.push(`UPDATE persons SET gender = '${f.json.replace(/'/g, "''")}' WHERE id = ${f.db_id};`);
}
for (const f of fatherFixes) {
    sql.push(`UPDATE persons SET father_id = ${f.expected === null ? 'NULL' : f.expected} WHERE id = ${f.db_id};`);
}
for (const f of motherFixes) {
    sql.push(`UPDATE persons SET mother_id = ${f.expected === null ? 'NULL' : f.expected} WHERE id = ${f.db_id};`);
}
for (const f of spouseFixes) {
    const arr = f.expected.length > 0 ? `ARRAY[${f.expected.join(',')}]` : "'{}'::integer[]";
    sql.push(`UPDATE persons SET spouse_ids = ${arr} WHERE id = ${f.db_id};`);
}

output.push(`\nGenerated ${sql.length} SQL fix statements`);

fs.writeFileSync('d:/Ngoding/expr/baniakhzab/sync_report.txt', output.join('\n'), 'utf8');
fs.writeFileSync('d:/Ngoding/expr/baniakhzab/fix_data_final.sql', sql.join('\n'), 'utf8');
console.log('Report saved to sync_report.txt');
console.log('SQL saved to fix_data_final.sql');
