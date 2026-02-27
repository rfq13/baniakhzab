-- Step 1: Fix AGUS YASIN's URL
UPDATE persons SET url = 'https://app.silsilahku.com/masakhzab/det/profile/236/2', full_name = 'AGUS YASIN' WHERE id = 1759;

-- Step 2: Fix father_id references
UPDATE persons SET father_id = 1437 WHERE id = 1281; -- M. Rifqy Fakhrul Hadi: null -> 1437
UPDATE persons SET father_id = 1437 WHERE id = 1304; -- Siti Nurul Masithah: null -> 1437
UPDATE persons SET father_id = 1437 WHERE id = 1305; -- Moh Machrus ali: null -> 1437
UPDATE persons SET father_id = 1760 WHERE id = 1760; -- ABDUL GHONI: null -> 1760

-- Step 3: Fix mother_id references
UPDATE persons SET mother_id = 1689 WHERE id = 1437; -- Luqman Hakim: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1438; -- Ahmad Nurul Hadi: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1439; -- Siti Mas'udah: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1440; -- Hasan Bashori: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1442; -- M. Badri: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1443; -- Siti Masruroh: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1444; -- Ahmad Munib: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1445; -- Siti Suaibah: null -> 1689
UPDATE persons SET mother_id = 1689 WHERE id = 1456; -- Siti Nur Afifah: null -> 1689
UPDATE persons SET mother_id = 1761 WHERE id = 1760; -- ABDUL GHONI: null -> 1761

-- Step 4: Fix spouse_ids references
UPDATE persons SET spouse_ids = ARRAY[1437] WHERE id = 1282; -- Miftakhus Sa'adah: [] -> [1437]
UPDATE persons SET spouse_ids = ARRAY[1689] WHERE id = 1680; -- ABU BAKAR: [] -> [1689]
UPDATE persons SET spouse_ids = ARRAY[1758] WHERE id = 1760; -- ABDUL GHONI: [1761] -> [1758]

-- Step 5: Fix name mismatches
UPDATE persons SET full_name = 'AGUS YASIN' WHERE id = 1760; -- was: ABDUL GHONI