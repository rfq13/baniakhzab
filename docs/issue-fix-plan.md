# Plan Perbaikan Issue Family Tree - Revisi

## Analisis Masalah

### Issue 1: Anak dengan Istri Lebih dari 1 Muncul Berkali-kali

**Status: SUDAH DIIMPLEMENTASIKAN** ✓

### Issue 2: Pernikahan Sepupu - MUHAYYAH Tidak Muncul Sebagai Anak

**Data yang relevan:**

- **SALIM (300)**: is_mantu=false, father=196, mother=68, spouse=301
- **KHAFSOH (301)**: is_mantu=true, spouse=300
- **MUHAYYAH (306/url:317)**: is_mantu=false, father=300, mother=301, spouse=316
- **ABU BAKAR (316)**: is_mantu=false, father=313, mother=312, spouse=306

**Masalah:**
MUHAYYAH adalah anak dari SALIM & KHAFSOH, dan juga istri dari ABU BAKAR. Saat ini:

- MUHAYYAH hanya muncul sebagai istri ABU BAKAR
- MUHAYYAH **TIDAK** muncul sebagai anak di unit SALIM & KHAFSOH

**Penyebab:**
Dalam `buildFamilyTree.js`, ketika seseorang sudah menjadi bagian dari unit pernikahan (sebagai istri), mereka tidak lagi dimasukkan sebagai anak di unit orang tua mereka. Ini karena:

1. `buildChildUnits` memproses anak berdasarkan `child.spouseIds`
2. Setiap anak dengan pasangan akan membuat unit baru
3. Unit tersebut "dipindahkan" dari unit orang tua ke unit pasangan

**Visualisasi yang Diinginkan:**

```
[196]────[68]
    │
    ├── [SALIM:300]────[KHAFSOH:301]
    │         │
    │         ├── [MUHAYYAH:306]──────┐
    │         │                       │ (garis putus-putus)
    │         └── [anak lain]         │
    │                                 │
    └── [keturunan lain]              │
                                      │
    [SOFIYAH:312]────[AMIRIL:313]     │
           │                          │
           └──[ABU BAKAR:316]─────────┘
```

---

## Solusi Teknis

### Konsep Utama: "Dual Appearance" untuk Non-Mantu yang Menikah

**Aturan:**

1. Orang dengan `is_mantu=false` yang menikah harus tetap muncul sebagai anak di unit orang tua mereka
2. Mereka JUGA muncul sebagai pasangan di unit pernikahan mereka
3. Garis putus-putus menghubungkan kedua appearance tersebut

**Implementasi:**

#### 1. Modifikasi `buildFamilyTree.js`

**Tambahkan tracking untuk "dual appearance":**

```javascript
// Di buildChildUnits, untuk anak yang is_mantu=false dan menikah:
// 1. Tetap buat unit sebagai anak (dengan flag hasDualAppearance)
// 2. Juga buat unit sebagai pasangan

function buildChildUnits(
  childIds,
  persons,
  childrenMap,
  visitedUnits,
  polygamousUnits,
  dualAppearancePersons,
) {
  const children = [];
  for (const childId of childIds) {
    const child = persons.get(childId);
    if (!child) continue;

    // KASUS BARU: Anak non-mantu yang menikah
    // Tetap muncul sebagai anak dengan flag hasDualAppearance
    if (child.spouseIds.length > 0 && !child.isMantu) {
      // Buat unit "placeholder" sebagai anak
      const placeholderUnit = {
        id: childId,
        person: child, // orang itu sendiri, bukan pasangan
        hasDualAppearance: true,
        spouseIds: child.spouseIds,
        children: [], // tidak ada children di sini
        isPolygamous: false,
      };
      children.push(placeholderUnit);

      // Juga buat unit pernikahan terpisah (akan di-render di tempat lain)
      // ... logic untuk membuat unit pernikahan
    }
    // ... existing logic untuk kasus lain
  }
  return children;
}
```

#### 2. Modifikasi `FamilyUnit.jsx`

**Render untuk unit dengan `hasDualAppearance`:**

```jsx
// Komponen baru untuk menampilkan orang dengan dual appearance
const DualAppearanceCard = memo(function DualAppearanceCard({
  person,
  spouseIds,
}) {
  return (
    <div className="dual-appearance-card">
      <PersonCard person={person} />
      {/* Indikator bahwa orang ini juga muncul di tempat lain */}
      <div className="dual-indicator">
        ↗ Menikah dengan {spouseIds.length} pasangan
      </div>
    </div>
  );
});
```

#### 3. Tambahkan Garis Koneksi Antar Unit

**Di level FamilyTree atau wrapper:**

```jsx
// SVG overlay untuk menggambar garis putus-putus
// antara unit anak dan unit pernikahan
const DualConnectionLines = memo(function DualConnectionLines({
  units,
  positions,
}) {
  // positions = Map<unitId, {x, y}>
  const lines = [];

  units.forEach((unit) => {
    if (unit.hasDualAppearance) {
      const childPos = positions.get(unit.id);
      const marriageUnitId = findMarriageUnitId(unit.person.id);
      const marriagePos = positions.get(marriageUnitId);

      if (childPos && marriagePos) {
        lines.push(
          <line
            key={`dual-${unit.id}`}
            x1={childPos.x}
            y1={childPos.y}
            x2={marriagePos.x}
            y2={marriagePos.y}
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="5,5" // garis putus-putus
          />,
        );
      }
    }
  });

  return <svg className="dual-connections-overlay">{lines}</svg>;
});
```

---

## Pendekatan Alternatif: Simpler Solution

**Masalah dengan pendekatan di atas:** Kompleksitas tinggi, perlu koordinasi posisi antar unit.

**Solusi yang lebih sederhana:**

### Opsi A: Render Ulang di Dua Tempat

1. MUHAYYAH tetap muncul sebagai anak di unit SALIM & KHAFSOH
2. MUHAYYAH juga muncul sebagai istri di unit ABU BAKAR
3. Tidak ada garis penghubung visual, tapi kedua tempat menampilkan orang yang sama

**Keuntungan:**

- Implementasi lebih sederhana
- Tidak perlu koordinasi posisi

**Kekurangan:**

- Secara visual terlihat seperti 2 orang berbeda (meskipun nama sama)

### Opsi B: Hanya Tambah Garis dari Unit Pernikahan ke Orang Tua Istri

1. MUHAYYAH hanya muncul sebagai istri ABU BAKAR (seperti sekarang)
2. Tambahkan garis putus-putus dari unit ABU BAKAR-MUHAYYAH ke unit SALIM-KHAFSOH
3. Garis menunjukkan bahwa MUHAYYAH adalah anak dari SALIM & KHAFSOH

**Keuntungan:**

- Tidak ada duplikasi
- Hubungan keluarga tetap terlihat

**Kekurangan:**

- MUHAYYAH tidak muncul di daftar anak SALIM & KHAFSOH

---

## Rekomendasi: Opsi B dengan Modifikasi

**Solusi hybrid:**

1. **Di unit SALIM & KHAFSOH:**
   - MUHAYYAH muncul sebagai anak dengan card khusus
   - Card menunjukkan "Menikah dengan ABU BAKAR (lihat →)"
   - Tidak ada children di bawahnya

2. **Di unit ABU BAKAR:**
   - MUHAYYAH muncul sebagai istri
   - Children di bawah unit ini

3. **Garis putus-putus:**
   - Menghubungkan card MUHAYYAH di unit SALIM dengan card MUHAYYAH di unit ABU BAKAR

---

## Implementasi Detail

### Langkah 1: Modifikasi `buildFamilyTree.js`

```javascript
// Tambahkan parameter untuk track non-mantu children yang sudah menikah
function buildChildUnits(
  childIds,
  persons,
  childrenMap,
  visitedUnits,
  polygamousUnits,
  marriedNonMantuChildren,
) {
  const children = [];
  for (const childId of childIds) {
    const child = persons.get(childId);
    if (!child) continue;

    // KASUS BARU: Anak non-mantu yang menikah
    if (child.spouseIds.length > 0 && !child.isMantu) {
      // Tandai untuk dual appearance
      marriedNonMantuChildren.set(childId, {
        person: child,
        parentUnitId: null, // akan di-set nanti
      });

      // Buat unit "stub" sebagai anak
      const stubUnit = {
        id: `stub-${childId}`,
        stubPerson: child,
        isStub: true,
        children: [],
        isPolygamous: false,
      };
      children.push(stubUnit);
      continue;
    }

    // ... existing logic
  }
  return children;
}
```

### Langkah 2: Modifikasi `FamilyUnit.jsx`

```jsx
// Render stub unit
if (unit.isStub) {
  return (
    <div className="stub-unit">
      <PersonCard person={unit.stubPerson} />
      <div className="stub-indicator">
        <span className="stub-label">Menikah</span>
        <span className="stub-arrow">→</span>
      </div>
    </div>
  );
}
```

### Langkah 3: Tambahkan CSS

```css
.stub-unit {
  position: relative;
}

.stub-indicator {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #666;
  white-space: nowrap;
}

.stub-arrow {
  margin-left: 4px;
  color: #94a3b8;
}
```

---

## File yang Perlu Dimodifikasi

| File                            | Perubahan                                                |
| ------------------------------- | -------------------------------------------------------- |
| `src/utils/buildFamilyTree.js`  | Tambah logic untuk stub unit pada non-mantu yang menikah |
| `src/components/FamilyUnit.jsx` | Render stub unit dengan indikator                        |
| `src/styles.css`                | Styling untuk stub unit dan indikator                    |

---

## Test Case

```javascript
// Test: MUHAYYAH muncul di dua tempat
const salimUnit = findUnitWithHusband("300");
expect(salimUnit.children).toContainEqual(
  expect.objectContaining({
    isStub: true,
    stubPerson: expect.objectContaining({ id: "306" }),
  }),
);

const abuBakarUnit = findUnitWithHusband("316");
expect(abuBakarUnit.wife).toBeDefined();
expect(abuBakarUnit.wife.id).toBe("306");
```

---

## Catatan Penting

1. **Tidak ada duplikasi data** - MUHAYYAH tetap satu entitas di data
2. **Hanya visual** - Yang berubah adalah cara rendering, bukan struktur data
3. **Backward compatible** - Kasus existing tidak terpengaruh
4. **Fokus pada is_mantu=false** - Hanya keturunan asli yang perlu dual appearance
