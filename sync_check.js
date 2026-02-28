// Compare with-gender.json with DB data via API
import fs from 'fs';
const jsonData = JSON.parse(fs.readFileSync('d:/Ngoding/expr/baniakhzab/with-gender.json', 'utf8'));
import http from 'http';

function extractProfileId(url) {
    if (!url) return null;
    const match = url.match(/\/profile\/(\d+)\//);
    return match ? match[1] : null;
}

function fetchTreeApi() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:8080/api/v1/tree', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
            res.on('error', reject);
        });
    });
}

async function main() {
    const treeResp = await fetchTreeApi();
    const dbPersons = treeResp.persons;

    // Build URL -> DB person map
    const urlToDbPerson = {};
    for (const p of dbPersons) {
        if (p.url) urlToDbPerson[p.url] = p;
    }

    let wrongFather = 0, wrongMother = 0, wrongSpouse = 0, nameMismatch = 0, genderMismatch = 0, missingInDb = 0;
    let samples = { father: [], mother: [], spouse: [], name: [], gender: [] };

    for (const jsonP of jsonData) {
        const dbP = urlToDbPerson[jsonP.url];
        if (!dbP) { missingInDb++; continue; }

        // Name
        if (jsonP.name !== dbP.full_name) {
            nameMismatch++;
            if (samples.name.length < 5) samples.name.push(`  id=${dbP.id}: JSON="${jsonP.name}" DB="${dbP.full_name}"`);
        }

        // Gender
        if (jsonP.gender !== dbP.gender) {
            genderMismatch++;
            if (samples.gender.length < 5) samples.gender.push(`  id=${dbP.id}: JSON="${jsonP.gender}" DB="${dbP.gender}"`);
        }

        // Father
        const expectedFatherId = jsonP.father_url ? urlToDbPerson[jsonP.father_url]?.id : null;
        const actualFatherId = dbP.father_id || null;
        if (String(expectedFatherId || '') !== String(actualFatherId || '')) {
            wrongFather++;
            if (samples.father.length < 5) samples.father.push(`  ${dbP.full_name} (${dbP.id}): expected=${expectedFatherId}, actual=${actualFatherId}`);
        }

        // Mother
        const expectedMotherId = jsonP.mother_url ? urlToDbPerson[jsonP.mother_url]?.id : null;
        const actualMotherId = dbP.mother_id || null;
        if (String(expectedMotherId || '') !== String(actualMotherId || '')) {
            wrongMother++;
            if (samples.mother.length < 5) samples.mother.push(`  ${dbP.full_name} (${dbP.id}): expected=${expectedMotherId}, actual=${actualMotherId}`);
        }

        // Spouses
        const expectedSpouseIds = (jsonP.spouse_urls || []).map(u => urlToDbPerson[u]?.id).filter(Boolean).map(String).sort();
        const actualSpouseIds = (dbP.spouse_ids || []).map(String).sort();
        if (JSON.stringify(expectedSpouseIds) !== JSON.stringify(actualSpouseIds)) {
            wrongSpouse++;
            if (samples.spouse.length < 5) samples.spouse.push(`  ${dbP.full_name} (${dbP.id}): expected=${JSON.stringify(expectedSpouseIds)}, actual=${JSON.stringify(actualSpouseIds)}`);
        }
    }

    console.log('=== SYNC REPORT ===');
    console.log(`Total JSON: ${jsonData.length}, Total DB: ${dbPersons.length}`);
    console.log(`Missing in DB: ${missingInDb}`);
    console.log(`Name mismatches: ${nameMismatch}`);
    console.log(`Gender mismatches: ${genderMismatch}`);
    console.log(`Wrong father_id: ${wrongFather}`);
    console.log(`Wrong mother_id: ${wrongMother}`);
    console.log(`Wrong spouse_ids: ${wrongSpouse}`);

    for (const [key, label] of [['father', 'Wrong Father'], ['mother', 'Wrong Mother'], ['spouse', 'Wrong Spouse'], ['name', 'Name Mismatch'], ['gender', 'Gender Mismatch']]) {
        if (samples[key].length > 0) {
            console.log(`\n--- ${label} (sample) ---`);
            samples[key].forEach(s => console.log(s));
        }
    }
}

main().catch(console.error);
