import dagre from "dagre";

const PROFILE_ID_REGEX = /profile\/(\d+)\//;
const nodeWidth = 180;
const nodeHeight = 60;

const extractIdFromUrl = (url) => {
  if (!url) {
    return null;
  }
  const match = String(url).match(PROFILE_ID_REGEX);
  return match ? match[1] : null;
};

const normalizeFamilyData = (items) => {
  const idSet = new Set();
  const urlToId = new Map();

  items.forEach((person) => {
    const id = String(person.id);
    if (idSet.has(id)) {
      throw new Error(`Duplicate ID detected: ${id}`);
    }
    idSet.add(id);
    if (person.url) {
      urlToId.set(person.url, id);
    }
  });

  return items.map((person) => {
    const fatherCandidate = extractIdFromUrl(person.father_url);
    const motherCandidate = extractIdFromUrl(person.mother_url);

    const fatherId = fatherCandidate && idSet.has(fatherCandidate) ? fatherCandidate : null;
    const motherId = motherCandidate && idSet.has(motherCandidate) ? motherCandidate : null;

    const spouseIds = [];
    const spouseSet = new Set();
    (person.spouse_urls || []).forEach((spouseUrl) => {
      const spouseId = extractIdFromUrl(spouseUrl);
      if (spouseId && idSet.has(spouseId) && !spouseSet.has(spouseId)) {
        spouseSet.add(spouseId);
        spouseIds.push(spouseId);
      }
    });

    const rawGender = person.gender || "";
    const gender =
      rawGender === "Laki-laki"
        ? "male"
        : rawGender === "Perempuan"
        ? "female"
        : "unknown";

    return {
      id: String(person.id),
      name: person.name || "Tanpa Nama",
      fatherId,
      motherId,
      spouseIds,
      isMantu: Boolean(person.is_mantu),
      imgUrl: person.img_url || "",
      gender
    };
  });
};

const validateFamilyData = (items) => {
  const childrenMap = new Map();
  items.forEach((person) => {
    if (person.fatherId === person.id || person.motherId === person.id) {
      throw new Error(`Self parent detected: ${person.id}`);
    }
    if (person.fatherId) {
      if (!childrenMap.has(person.fatherId)) {
        childrenMap.set(person.fatherId, []);
      }
      childrenMap.get(person.fatherId).push(person.id);
    }
    if (person.motherId) {
      if (!childrenMap.has(person.motherId)) {
        childrenMap.set(person.motherId, []);
      }
      childrenMap.get(person.motherId).push(person.id);
    }
  });

  const visited = new Set();
  const stack = new Set();

  const dfs = (id) => {
    if (stack.has(id)) {
      throw new Error("Circular reference detected in family tree");
    }
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    stack.add(id);
    const children = childrenMap.get(id) || [];
    children.forEach((childId) => {
      dfs(childId);
    });
    stack.delete(id);
  };

  items.forEach((person) => {
    if (!visited.has(person.id)) {
      dfs(person.id);
    }
  });
};

const transformToGraph = (items) => {
  const nodes = items.map((person) => ({
    id: person.id,
    type: "person",
    data: {
      label: person.name,
      isMantu: person.isMantu,
      imgUrl: person.imgUrl,
      gender: person.gender
    },
    position: { x: 0, y: 0 }
  }));

  const edges = [];
  items.forEach((person) => {
    if (person.fatherId) {
      edges.push({
        id: `${person.fatherId}->${person.id}`,
        source: person.fatherId,
        target: person.id,
        type: "smoothstep"
      });
    }
    if (person.motherId) {
      edges.push({
        id: `${person.motherId}->${person.id}`,
        source: person.motherId,
        target: person.id,
        type: "smoothstep"
      });
    }
  });

  const spouseEdgeIds = new Set();
  items.forEach((person) => {
    person.spouseIds.forEach((spouseId) => {
      const [a, b] = [person.id, spouseId].sort();
      const edgeId = `spouse-${a}-${b}`;
      if (spouseEdgeIds.has(edgeId)) {
        return;
      }
      spouseEdgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        source: a,
        target: b,
        type: "straight"
      });
    });
  });

  return { nodes, edges };
};

const applyDagreLayout = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "TB",
    nodesep: 50,
    ranksep: 120,
    marginx: 20,
    marginy: 20,
    ranker: "tight-tree"
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id) || { x: 0, y: 0 };
    return {
      ...node,
      position: {
        x: dagreNode.x - nodeWidth / 2,
        y: dagreNode.y - nodeHeight / 2
      }
    };
  });
};

export const buildOrgGraph = (items) => {
  const normalized = normalizeFamilyData(items);
  validateFamilyData(normalized);
  const { nodes, edges } = transformToGraph(normalized);
  const layoutNodes = applyDagreLayout(nodes, edges);
  return { nodes: layoutNodes, edges };
};
