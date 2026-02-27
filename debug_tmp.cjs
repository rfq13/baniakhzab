const fs = require('fs');
const d = JSON.parse(fs.readFileSync('d:/Ngoding/expr/baniakhzab/with-gender.json', 'utf8'));

const a = d.find(x => x.id === '236');
const b = d.find(x => x.id === '235');

fs.writeFileSync('d:/Ngoding/expr/baniakhzab/debug_output.txt', [
    'AGUS YASIN (id=236):',
    '  url: ' + a.url,
    '  father_url: ' + a.father_url,
    '  mother_url: ' + a.mother_url,
    '  spouse_urls: ' + JSON.stringify(a.spouse_urls),
    '',
    'ABDUL GHONI (id=235):',
    '  url: ' + b.url,
    '  father_url: ' + b.father_url,
    '  mother_url: ' + b.mother_url,
    '  spouse_urls: ' + JSON.stringify(b.spouse_urls),
].join('\n'), 'utf8');
console.log('done');
