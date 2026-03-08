import fs from "fs-extra";

const inputPath = "with-whatsapp.json";
const outputPath = "update_wa.sql";

const main = async () => {
  const data = await fs.readJson(inputPath);
  
  // Filter hanya data yang memiliki whatsapp_link dan ekstrak nomornya
  const updates = data
    .filter(item => item.whatsapp_link && item.whatsapp_link.includes("wa.me/"))
    .map(item => {
      const match = item.whatsapp_link.match(/wa\.me\/(\d+)/);
      return {
        url: item.url,
        wa_number: match ? match[1] : null
      };
    })
    .filter(item => item.wa_number !== null);

  if (updates.length === 0) {
    console.log("Tidak ada data WhatsApp untuk diupdate.");
    return;
  }

  // Membuat SQL dengan format UPDATE FROM VALUES (efisien untuk PostgreSQL)
  let sql = "UPDATE persons AS p\nSET wa_number = v.wa_number\nFROM (VALUES\n";
  
  const values = updates.map(item => `  ('${item.url}', '${item.wa_number}')`).join(",\n");
  
  sql += values;
  sql += "\n) AS v(url, wa_number)\nWHERE p.url = v.url;";

  await fs.writeFile(outputPath, sql);
  console.log(`Berhasil membuat ${outputPath} dengan ${updates.length} data update.`);
};

main().catch(console.error);
