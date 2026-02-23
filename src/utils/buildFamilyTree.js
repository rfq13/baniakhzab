const PROFILE_ID_REGEX = /profile\/(\d+)\//;

function extractId(url) {
  if (!url) return null;
  const m = String(url).match(PROFILE_ID_REGEX);
  return m ? m[1] : null;
}

export function normalizePersons(rawData) {
  // First pass: build URL-ID → canonical ID secondary index.
  // Some persons have a url like /profile/486/ but id field = 577.
  // References (father_url, spouse_urls, etc.) use the URL-based number,
  // so we need to resolve them back to the canonical id.
  const urlIdMap = new Map();
  rawData.forEach((p) => {
    const urlId = extractId(p.url);
    const canonicalId = String(p.id);
    if (urlId && urlId !== canonicalId) urlIdMap.set(urlId, canonicalId);
  });

  const resolveRef = (url) => {
    const urlId = extractId(url);
    if (!urlId) return null;
    return urlIdMap.has(urlId) ? urlIdMap.get(urlId) : urlId;
  };

  const persons = new Map();
  rawData.forEach((p) => {
    const id = String(p.id);
    const rawGender = p.gender || "";
    const gender =
      rawGender === "Laki-laki"
        ? "male"
        : rawGender === "Perempuan"
          ? "female"
          : "unknown";
    persons.set(id, {
      id,
      name: p.name || "Tanpa Nama",
      gender,
      isMantu: Boolean(p.is_mantu),
      generation: p.generation || null,
      imgUrl: p.img_url || "",
      fatherId: resolveRef(p.father_url),
      motherId: resolveRef(p.mother_url),
      spouseIds: (p.spouse_urls || []).map(resolveRef).filter(Boolean),
    });
  });
  // Remove IDs that point outside the dataset
  persons.forEach((person) => {
    if (person.fatherId && !persons.has(person.fatherId))
      person.fatherId = null;
    if (person.motherId && !persons.has(person.motherId))
      person.motherId = null;
    person.spouseIds = person.spouseIds.filter((sid) => persons.has(sid));
  });
  const spouseSets = new Map();
  persons.forEach((person) => {
    spouseSets.set(person.id, new Set(person.spouseIds));
  });
  persons.forEach((child) => {
    const fatherId = child.fatherId;
    const motherId = child.motherId;
    if (
      fatherId &&
      motherId &&
      persons.has(fatherId) &&
      persons.has(motherId)
    ) {
      spouseSets.get(fatherId).add(motherId);
      spouseSets.get(motherId).add(fatherId);
    }
  });
  persons.forEach((person) => {
    person.spouseIds = Array.from(spouseSets.get(person.id));
  });
  return persons;
}

/**
 * Build a map: parentKey -> childIds
 * parentKey = "fatherId:motherId" (either can be null → "null")
 */
function buildChildrenMap(persons) {
  const map = new Map();
  persons.forEach((person) => {
    const fid = person.fatherId || "null";
    const mid = person.motherId || "null";
    const key = `${fid}:${mid}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(person.id);
  });
  return map;
}

/**
 * Recursively build a FamilyUnit tree.
 * husbandId / wifeId can be null for single-parent units.
 */
function buildChildUnits(
  childIds,
  persons,
  childrenMap,
  visitedUnits,
  polygamousUnits,
) {
  const children = [];
  for (const childId of childIds) {
    const child = persons.get(childId);
    if (!child) continue;

    if (child.spouseIds.length === 0) {
      const unit = buildUnit(
        child.gender !== "female" ? childId : null,
        child.gender === "female" ? childId : null,
        persons,
        childrenMap,
        visitedUnits,
        polygamousUnits,
      );
      if (unit) children.push(unit);
    } else {
      let stubAdded = false;
      for (const spouseId of child.spouseIds) {
        const spouse = persons.get(spouseId);
        if (!spouse) continue;
        const childHasParents = Boolean(child.fatherId && child.motherId);
        const spouseHasParents = Boolean(spouse.fatherId && spouse.motherId);
        const bothNonMantu = !child.isMantu && !spouse.isMantu;
        const childMulti = child.spouseIds.length > 1;
        const spouseMulti = spouse.spouseIds.length > 1;
        if (childMulti || spouseMulti) {
          if (!childMulti && spouseMulti) {
            if (!spouse.isMantu) continue;
          }

          if (childMulti && spouseMulti) {
            if (child.gender === "female" && spouse.gender === "male") {
              continue;
            }
            if (!(child.gender === "male" && spouse.gender !== "male")) {
              const [a, b] = [child.id, spouse.id].sort();
              if (child.id !== a) continue;
            }
          }
        } else if (bothNonMantu && childHasParents && spouseHasParents) {
          if (child.gender === "female" && spouse.gender === "male") {
            if (!stubAdded && !child.isMantu) {
              const stubUnit = {
                id: `stub-${child.id}`,
                stubPerson: child,
                isStub: true,
                children: [],
                isPolygamous: false,
              };
              children.push(stubUnit);
              stubAdded = true;
            }
            continue;
          }
          if (!(child.gender === "male" && spouse.gender !== "male")) {
            const [a, b] = [child.id, spouse.id].sort();
            if (child.id !== a) continue;
          }
        }
        let hid, wid;
        if (child.gender === "male") {
          hid = childId;
          wid = spouseId;
        } else if (child.gender === "female") {
          hid = spouseId;
          wid = childId;
        } else {
          const [a, b] = [childId, spouseId].sort();
          hid = a;
          wid = b;
        }
        const unit = buildUnit(
          hid,
          wid,
          persons,
          childrenMap,
          visitedUnits,
          polygamousUnits,
        );
        if (unit) children.push(unit);
      }
    }
  }
  return children;
}

function buildUnit(
  husbandId,
  wifeId,
  persons,
  childrenMap,
  visitedUnits,
  polygamousUnits,
) {
  const resolveChildIds = (aId, bId) => {
    const keyA = `${aId || "null"}:${bId || "null"}`;
    const keyB = `${bId || "null"}:${aId || "null"}`;
    if (childrenMap.has(keyA)) return childrenMap.get(keyA) || [];
    if (childrenMap.has(keyB)) return childrenMap.get(keyB) || [];
    return [];
  };
  const key = `${husbandId || "null"}:${wifeId || "null"}`;
  if (visitedUnits.has(key)) return null;
  visitedUnits.add(key);

  const husband = husbandId ? persons.get(husbandId) : null;
  const wife = wifeId ? persons.get(wifeId) : null;

  if (
    husband &&
    husband.spouseIds.length > 1 &&
    (!husband.isMantu || husband.generation === "G1")
  ) {
    if (polygamousUnits.has(husbandId)) return null;
    const unit = {
      id: husbandId,
      husband,
      wife: null,
      children: [],
      marriages: [],
      isPolygamous: true,
    };
    polygamousUnits.set(husbandId, unit);
    for (const spouseId of husband.spouseIds) {
      const spouse = persons.get(spouseId);
      if (!spouse) continue;
      const childIds = resolveChildIds(husbandId, spouseId);
      const children = buildChildUnits(
        childIds,
        persons,
        childrenMap,
        visitedUnits,
        polygamousUnits,
      );
      unit.marriages.push({ wife: spouse, children });
      visitedUnits.add(`${spouseId || "null"}:${husbandId || "null"}`);
      visitedUnits.add(`${husbandId || "null"}:${spouseId || "null"}`);
    }
    return unit;
  }

  if (
    wife &&
    wife.spouseIds.length > 1 &&
    (!wife.isMantu || wife.generation === "G1")
  ) {
    if (polygamousUnits.has(wifeId)) return null;
    const unit = {
      id: wifeId,
      husband: wife,
      wife: null,
      children: [],
      marriages: [],
      isPolygamous: true,
    };
    polygamousUnits.set(wifeId, unit);
    for (const spouseId of wife.spouseIds) {
      const spouse = persons.get(spouseId);
      if (!spouse) continue;
      const childIds = resolveChildIds(spouseId, wifeId);
      const children = buildChildUnits(
        childIds,
        persons,
        childrenMap,
        visitedUnits,
        polygamousUnits,
      );
      unit.marriages.push({ wife: spouse, children });
      visitedUnits.add(`${spouseId || "null"}:${wifeId || "null"}`);
      visitedUnits.add(`${wifeId || "null"}:${spouseId || "null"}`);
    }
    return unit;
  }

  const childIds = resolveChildIds(husbandId, wifeId);
  const children = buildChildUnits(
    childIds,
    persons,
    childrenMap,
    visitedUnits,
    polygamousUnits,
  );

  let dualConnection = null;
  if (
    husband &&
    wife &&
    !husband.isMantu &&
    !wife.isMantu &&
    wife.fatherId &&
    wife.motherId &&
    persons.has(wife.fatherId) &&
    persons.has(wife.motherId)
  ) {
    dualConnection = {
      wifeParentUnitId: `${wife.fatherId}:${wife.motherId}`,
      type: "cousin_marriage",
    };
  }

  const unit = {
    id: key,
    husband: husband || null,
    wife: wife || null,
    children,
    isPolygamous: false,
  };
  if (dualConnection) unit.dualConnection = dualConnection;
  return unit;
}

/**
 * A person is a "root" if:
 *  1. They have no parents in the dataset (fatherId=null && motherId=null)
 *  2. None of their spouses have parents in the dataset
 *     (filters out is_mantu spouses who married into non-root generations)
 */
export function isRootPerson(person, persons) {
  // Explicit G1 marker in data → always a root
  if (person.generation === "G1") return true;
  // Persons with known parents are never roots
  if (person.fatherId || person.motherId) return false;
  // is_mantu with no resolved spouse = dangling in-law (relationship defined
  // only on the other side); they appear via their spouse's unit, not as roots
  if (person.isMantu && person.spouseIds.length === 0) return false;
  // Otherwise: no spouse has parents either
  for (const spouseId of person.spouseIds) {
    const spouse = persons.get(spouseId);
    if (spouse && (spouse.fatherId || spouse.motherId)) {
      // console.log(`Person ${person.id} is not root because spouse ${spouseId} has parents`);
      return false;
    }
  }
  return true;
}

export function buildFamilyTree(rawData) {
  const persons = normalizePersons(rawData);
  const childrenMap = buildChildrenMap(persons);

  /*
  console.log("--- ChildrenMap Analysis ---");
  console.log("196:68 ->", childrenMap.get("196:68") || "none");
  console.log("267:268 ->", childrenMap.get("267:268") || "none");
  console.log("268:267 ->", childrenMap.get("268:267") || "none");
  console.log(
    "Mustofa (267) parent key:",
    `${persons.get("267")?.fatherId}:${persons.get("267")?.motherId}`,
  );
  console.log(
    "H Khusen (271) parent key:",
    `${persons.get("271")?.fatherId}:${persons.get("271")?.motherId}`,
  );
  console.log("---------------------------");
  */

  const rootPersonIds = [];
  persons.forEach((person) => {
    if (isRootPerson(person, persons)) rootPersonIds.push(person.id);
  });

  const visitedUnits = new Set();
  const polygamousUnits = new Map();
  const rootUnits = [];
  const handledPersons = new Set();

  for (const rootId of rootPersonIds) {
    if (handledPersons.has(rootId)) continue;
    const person = persons.get(rootId);
    if (!person) continue;

    if (person.spouseIds.length === 0) {
      handledPersons.add(rootId);
      const hid = person.gender !== "female" ? rootId : null;
      const wid = person.gender === "female" ? rootId : null;
      const unit = buildUnit(
        hid,
        wid,
        persons,
        childrenMap,
        visitedUnits,
        polygamousUnits,
      );
      if (unit) rootUnits.push(unit);
    } else {
      for (const spouseId of person.spouseIds) {
        const spouse = persons.get(spouseId);
        if (!spouse) continue;
        let hid, wid;
        if (person.gender === "male") {
          hid = rootId;
          wid = spouseId;
        } else if (person.gender === "female") {
          hid = spouseId;
          wid = rootId;
        } else {
          const [a, b] = [rootId, spouseId].sort();
          hid = a;
          wid = b;
        }
        if (hid === "267" && wid === "268") {
          console.log("Building Unit for 267 & 268");
        }

        const pairKey = `${hid}:${wid}`;
        if (visitedUnits.has(pairKey)) {
          if (hid === "267" && wid === "268") {
            console.log("Unit 267:268 already visited!");
          }
          handledPersons.add(rootId);
          handledPersons.add(spouseId);
          continue;
        }
        handledPersons.add(rootId);
        handledPersons.add(spouseId);
        const unit = buildUnit(
          hid,
          wid,
          persons,
          childrenMap,
          visitedUnits,
          polygamousUnits,
        );
        if (unit) rootUnits.push(unit);
      }
      if (!handledPersons.has(rootId)) {
        handledPersons.add(rootId);
        const hid = person.gender !== "female" ? rootId : null;
        const wid = person.gender === "female" ? rootId : null;
        const unit = buildUnit(
          hid,
          wid,
          persons,
          childrenMap,
          visitedUnits,
          polygamousUnits,
        );
        if (unit) rootUnits.push(unit);
      }
    }
  }

  return rootUnits;
}

const relationGraphCache = {
  personsRef: null,
  graph: null,
};

const relationPathsCache = new Map();

function getRelationGraph(persons) {
  if (relationGraphCache.personsRef === persons && relationGraphCache.graph) {
    return relationGraphCache.graph;
  }
  const graph = new Map();
  const ensure = (id) => {
    if (!graph.has(id)) graph.set(id, []);
    return graph.get(id);
  };
  persons.forEach((p) => {
    ensure(p.id);
  });
  persons.forEach((p) => {
    const pid = p.id;
    if (p.fatherId && persons.has(p.fatherId)) {
      ensure(pid).push({ to: p.fatherId, kind: "parent", dir: "to_parent" });
      ensure(p.fatherId).push({
        to: pid,
        kind: "parent",
        dir: "to_child",
      });
    }
    if (p.motherId && persons.has(p.motherId)) {
      ensure(pid).push({ to: p.motherId, kind: "parent", dir: "to_parent" });
      ensure(p.motherId).push({
        to: pid,
        kind: "parent",
        dir: "to_child",
      });
    }
    p.spouseIds.forEach((sid) => {
      if (!persons.has(sid)) return;
      if (sid === pid) return;
      ensure(pid).push({ to: sid, kind: "spouse", dir: "spouse" });
    });
  });
  relationGraphCache.personsRef = persons;
  relationGraphCache.graph = graph;
  return graph;
}

export function findRelationPaths(persons, fromId, toId, allowedKinds) {
  if (!persons || !fromId || !toId || fromId === toId) {
    return { paths: [], shortestLength: null };
  }
  if (!persons.has(fromId) || !persons.has(toId)) {
    return { paths: [], shortestLength: null };
  }
  const kinds = allowedKinds || { parent: true, spouse: true };
  const key = JSON.stringify([fromId, toId, kinds]);
  if (relationPathsCache.has(key)) {
    return relationPathsCache.get(key);
  }
  const graph = getRelationGraph(persons);
  const maxSteps = 16;
  const dist = new Map();
  const prev = new Map();
  const queue = [];
  dist.set(fromId, 0);
  queue.push(fromId);
  while (queue.length > 0) {
    const id = queue.shift();
    const d = dist.get(id);
    if (d >= maxSteps) continue;
    const edges = graph.get(id) || [];
    for (const e of edges) {
      if (!kinds[e.kind]) continue;
      const nd = d + 1;
      if (!dist.has(e.to) || nd < dist.get(e.to)) {
        dist.set(e.to, nd);
        prev.set(e.to, [id]);
        queue.push(e.to);
      } else if (nd === dist.get(e.to)) {
        const list = prev.get(e.to);
        if (list && !list.includes(id)) list.push(id);
      }
    }
  }
  if (!dist.has(toId)) {
    const empty = { paths: [], shortestLength: null };
    relationPathsCache.set(key, empty);
    return empty;
  }
  const targetDist = dist.get(toId);
  const paths = [];
  const path = [];
  const backtrack = (current) => {
    path.push(current);
    if (current === fromId) {
      const nodes = [...path].reverse();
      paths.push(nodes);
    } else {
      const prevList = prev.get(current) || [];
      prevList.forEach((p) => backtrack(p));
    }
    path.pop();
  };
  backtrack(toId);

  const detailedPaths = paths.map((nodes) => {
    const steps = [];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const edges = (graph.get(a) || []).filter((e) => e.to === b);
      const edge = edges[0] || null;
      steps.push({
        fromId: a,
        toId: b,
        kind: edge ? edge.kind : null,
        dir: edge ? edge.dir : null,
      });
    }
    return {
      nodes,
      steps,
      length: nodes.length - 1,
    };
  });

  const result = { paths: detailedPaths, shortestLength: targetDist };
  relationPathsCache.set(key, result);
  return result;
}

// ── Layout metrics ────────────────────────────────────────────────────────────
export const LAYOUT = {
  CARD_W: 164,
  CARD_H: 80,
  COUPLE_GAP: 28, // gap between H & W cards (marriage bar lives here)
  CHILD_GAP: 32, // horizontal gap between sibling subtrees
  GEN_GAP: 90, // vertical gap between generations (connector SVG height)
  MARRIAGE_BAR_H: 3,
  POLYGAMY_GAP: 40,
  POLYGAMY_WIFE_GAP: 32,
};

export function coupleWidth(unit) {
  const hasH = Boolean(unit.husband);
  const hasW = Boolean(unit.wife);
  if (hasH && hasW) return LAYOUT.CARD_W * 2 + LAYOUT.COUPLE_GAP;
  return LAYOUT.CARD_W;
}

export function subtreeWidth(unit) {
  // Stub unit: hanya satu card + indicator
  if (unit.isStub) {
    return LAYOUT.CARD_W;
  }
  if (unit.isPolygamous) {
    const wivesW = polygamyWivesWidth(unit);
    return Math.max(LAYOUT.CARD_W, wivesW);
  }
  if (unit.children.length === 0) return coupleWidth(unit);
  const childrenTotalW =
    unit.children.reduce((s, c) => s + subtreeWidth(c), 0) +
    LAYOUT.CHILD_GAP * (unit.children.length - 1);
  return Math.max(coupleWidth(unit), childrenTotalW);
}

export function marriageGroupWidth(marriage) {
  if (!marriage.children || marriage.children.length === 0)
    return LAYOUT.CARD_W;
  const childrenTotalW =
    marriage.children.reduce((s, c) => s + subtreeWidth(c), 0) +
    LAYOUT.CHILD_GAP * (marriage.children.length - 1);
  return Math.max(LAYOUT.CARD_W, childrenTotalW);
}

export function polygamyWivesWidth(unit) {
  if (!unit.marriages || unit.marriages.length === 0) return LAYOUT.CARD_W;
  const total =
    unit.marriages.reduce((s, m) => s + marriageGroupWidth(m), 0) +
    LAYOUT.POLYGAMY_WIFE_GAP * (unit.marriages.length - 1);
  return Math.max(LAYOUT.CARD_W, total);
}
