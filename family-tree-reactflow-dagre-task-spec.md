# FAMILY TREE IMPLEMENTATION SPECIFICATION

## React Flow + Dagre + Data Normalization

Generated: 2026-02-21T02:21:21.318811 UTC

------------------------------------------------------------------------

# 1. OBJECTIVE

Implement a scalable, printable, and fully validated family tree system
using:

-   React 18+
-   TypeScript (STRICT, no `any` allowed)
-   reactflow (\>= v11)
-   dagre (\>= v0.8)

System must:

1.  Auto-layout using Dagre (NO manual positioning)
2.  Support 1000+ nodes
3.  Prevent overlap
4.  Minimize whitespace
5.  Support export to high-resolution PNG and SVG
6.  Validate and normalize raw data before rendering

------------------------------------------------------------------------

# 2. NON-GOALS (DO NOT DO)

-   ❌ Do NOT use flexbox tree layout
-   ❌ Do NOT manually position nodes
-   ❌ Do NOT use d3-force
-   ❌ Do NOT use random placement
-   ❌ Do NOT skip validation layer
-   ❌ Do NOT create phantom/dummy parent nodes
-   ❌ Do NOT use URL as node id

------------------------------------------------------------------------

# 3. INSTALLATION

``` bash
npm install reactflow dagre
```

Versions: - reactflow \>= 11 - dagre \>= 0.8

------------------------------------------------------------------------

# 4. RAW INPUT DATA STRUCTURE

Example:

``` json
[
  {
    "id": "736",
    "name": "M. Rifqy Fakhrul Hadi",
    "url": "https://app.silsilahku.com/masakhzab/det/profile/736/2",
    "father_url": "https://app.silsilahku.com/masakhzab/det/profile/486/2",
    "mother_url": "https://app.silsilahku.com/masakhzab/det/profile/735/2",
    "spouse_urls": [],
    "is_mantu": false,
    "img_url": ""
  }
]
```

------------------------------------------------------------------------

# 5. NORMALIZED DATA STRUCTURE

``` ts
export interface NormalizedPerson {
  id: string;
  name: string;
  fatherId?: string | null;
  motherId?: string | null;
  spouseIds: string[];
  isMantu: boolean;
  imgUrl?: string;
}
```

------------------------------------------------------------------------

# 6. NORMALIZATION RULES

## 6.1 Extract ID from URL

Use REGEX ONLY:

``` ts
/profile\/(\d+)\//
```

Do NOT use string splitting with fixed index.

## 6.2 Build URL → ID Map

Create:

``` ts
Map<string, string>
```

Mapping: - person.url → person.id

## 6.3 Resolve Parent IDs

If father_url exists: - Extract ID - Check if ID exists in dataset - If
not → set null

Same for mother_url.

## 6.4 Resolve Spouse IDs

For each spouse_url: - Extract ID - If exists → push to spouseIds - Else
ignore

------------------------------------------------------------------------

# 7. VALIDATION (MANDATORY)

## 7.1 Duplicate ID

Throw error if duplicate found.

## 7.2 Self Parent

If fatherId === id OR motherId === id → throw error.

## 7.3 Circular Reference Detection

Implement DFS-based cycle detection.

If cycle detected:

``` ts
throw new Error("Circular reference detected in family tree");
```

------------------------------------------------------------------------

# 8. REACT FLOW TRANSFORMATION

## 8.1 Node Shape

``` ts
{
  id: person.id,
  type: "person",
  data: {
    label: person.name,
    isMantu: person.isMantu,
    imgUrl: person.imgUrl
  },
  position: { x: 0, y: 0 }
}
```

Do NOT calculate manual position.

## 8.2 Edge Rules

Parent → Child: - fatherId → childId - motherId → childId - type:
"smoothstep"

Spouse: - unique edge only - sort ids before generating edge id - type:
"straight"

------------------------------------------------------------------------

# 9. DAGRE CONFIGURATION

## 9.1 Graph Settings

``` ts
dagreGraph.setGraph({
  rankdir: "TB",
  nodesep: 50,
  ranksep: 120,
  marginx: 20,
  marginy: 20,
  ranker: "tight-tree"
});
```

Horizontal mode: - rankdir: "LR"

## 9.2 Fixed Node Size

``` ts
const nodeWidth = 180;
const nodeHeight = 60;
```

DO NOT use dynamic height.

## 9.3 Layout Execution

``` ts
dagre.layout(dagreGraph);
```

## 9.4 Position Correction

``` ts
node.position = {
  x: dagreNode.x - nodeWidth / 2,
  y: dagreNode.y - nodeHeight / 2,
};
```

------------------------------------------------------------------------

# 10. CUSTOM NODE UI RULES

-   border-radius: 8px
-   font-size: 12px
-   centered text
-   overflow hidden
-   ellipsis enabled
-   dashed border if isMantu === true
-   placeholder circle if imgUrl empty
-   node dimension remains fixed

------------------------------------------------------------------------

# 11. PERFORMANCE REQUIREMENTS

For 1000 nodes:

-   Layout execution under 2 seconds
-   No UI freeze
-   Use useMemo for:
    -   normalization
    -   validation
    -   graph transform
    -   dagre layout

Time complexity target: O(n)

Avoid nested loops.

------------------------------------------------------------------------

# 12. EXPORT REQUIREMENTS

## 12.1 PNG

Use pixelRatio \>= 3

``` ts
toPng(element, { pixelRatio: 3 });
```

## 12.2 SVG

Prefer SVG export for large print.

## 12.3 Print Sizes

Support: - A4 - A3 - A2

Scale appropriately.

------------------------------------------------------------------------

# 13. PROJECT STRUCTURE

    /family-tree
      ├── components/
      │     ├── PersonNode.tsx
      ├── layout/
      │     ├── dagreLayout.ts
      ├── utils/
      │     ├── normalizeFamilyData.ts
      │     ├── validateFamilyData.ts
      │     ├── transformToGraph.ts
      ├── FamilyTree.tsx
      └── types.ts

------------------------------------------------------------------------

# 14. ACCEPTANCE CRITERIA

Implementation is complete when:

-   No node overlap
-   No console errors
-   No React warnings
-   Circular detection works
-   Duplicate detection works
-   Supports 500+ nodes without crash
-   Exported image remains sharp when zoomed

------------------------------------------------------------------------

# 15. STRICT ENGINEERING RULES

Engineer MUST:

-   Use strict TypeScript
-   Fully type all functions
-   Not skip validation
-   Not modify raw data structure
-   Not replace Dagre with another layout engine

Deviation is not allowed.
