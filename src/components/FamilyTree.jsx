import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  memo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { toPng, toSvg } from 'html-to-image';
import createPanZoom from 'panzoom';
import FamilyUnit from './FamilyUnit.jsx';
import { findRelationPaths } from '../utils/buildFamilyTree.js';

const PAPER_SIZES = {
  A4: { width: 3508, height: 2480 },
  A3: { width: 4961, height: 3508 },
  A2: { width: 7016, height: 4961 },
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;
const ZOOM_PRECISION = 3;
const FOCUS_ZOOM_LEVEL = 1.2;
const TRANSFORM_IDLE_DELAY_MS = 140;
const CONNECTOR_GRAPH_SNAP = 2; // 0.5px precision
const CONNECTOR_NEAREST_MAX_DISTANCE = 120;

function parseGenerationNumber(gen) {
  if (!gen) return null;
  const m = String(gen).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function snapConnectorCoordinate(value) {
  return Math.round(value * CONNECTOR_GRAPH_SNAP) / CONNECTOR_GRAPH_SNAP;
}

function pointDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointManhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function buildConnectorGraph(segments) {
  const nodes = [];
  const indexByKey = new Map();
  const adjacency = new Map();
  const seenEdges = new Set();
  const connectionTolerance = 0.51;

  const ensureNode = (x, y) => {
    const sx = snapConnectorCoordinate(x);
    const sy = snapConnectorCoordinate(y);
    const key = `${sx}:${sy}`;
    if (indexByKey.has(key)) return indexByKey.get(key);
    const idx = nodes.length;
    nodes.push({ x: sx, y: sy });
    indexByKey.set(key, idx);
    adjacency.set(idx, []);
    return idx;
  };

  const isBetween = (value, a, b) =>
    value >= Math.min(a, b) - connectionTolerance &&
    value <= Math.max(a, b) + connectionTolerance;

  const addEdge = (a, b) => {
    if (a === b) return;
    const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seenEdges.has(edgeKey)) return;
    seenEdges.add(edgeKey);
    const weight = pointManhattanDistance(nodes[a], nodes[b]);
    adjacency.get(a).push({ to: b, weight });
    adjacency.get(b).push({ to: a, weight });
  };

  const normalizedSegments = segments
    .map((segment) => {
      const { x1, y1, x2, y2 } = segment;
      if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
      const sx1 = snapConnectorCoordinate(x1);
      const sy1 = snapConnectorCoordinate(y1);
      const sx2 = snapConnectorCoordinate(x2);
      const sy2 = snapConnectorCoordinate(y2);
      if (sx1 === sx2 && sy1 === sy2) return null;
      return { x1: sx1, y1: sy1, x2: sx2, y2: sy2 };
    })
    .filter(Boolean);

  const splitPointMaps = normalizedSegments.map((segment) => {
    const map = new Map();
    const addPoint = (x, y) => {
      const sx = snapConnectorCoordinate(x);
      const sy = snapConnectorCoordinate(y);
      map.set(`${sx}:${sy}`, { x: sx, y: sy });
    };
    addPoint(segment.x1, segment.y1);
    addPoint(segment.x2, segment.y2);
    return { map, addPoint };
  });

  for (let i = 0; i < normalizedSegments.length; i += 1) {
    const a = normalizedSegments[i];
    const aHorizontal = Math.abs(a.y1 - a.y2) <= connectionTolerance;
    const aVertical = Math.abs(a.x1 - a.x2) <= connectionTolerance;
    if (!aHorizontal && !aVertical) continue;

    for (let j = i + 1; j < normalizedSegments.length; j += 1) {
      const b = normalizedSegments[j];
      const bHorizontal = Math.abs(b.y1 - b.y2) <= connectionTolerance;
      const bVertical = Math.abs(b.x1 - b.x2) <= connectionTolerance;
      if (!bHorizontal && !bVertical) continue;

      if ((aHorizontal && bVertical) || (aVertical && bHorizontal)) {
        const horizontal = aHorizontal ? a : b;
        const vertical = aVertical ? a : b;
        const intersectionX = vertical.x1;
        const intersectionY = horizontal.y1;
        if (
          isBetween(intersectionX, horizontal.x1, horizontal.x2) &&
          isBetween(intersectionY, vertical.y1, vertical.y2)
        ) {
          splitPointMaps[i].addPoint(intersectionX, intersectionY);
          splitPointMaps[j].addPoint(intersectionX, intersectionY);
        }
      }
    }
  }

  normalizedSegments.forEach((segment, segmentIndex) => {
    const points = Array.from(splitPointMaps[segmentIndex].map.values());
    if (points.length < 2) return;

    const horizontal = Math.abs(segment.y1 - segment.y2) <= connectionTolerance;
    const vertical = Math.abs(segment.x1 - segment.x2) <= connectionTolerance;
    let ordered = points;

    if (horizontal) {
      ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    } else if (vertical) {
      ordered = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
    } else {
      ordered = [...points].sort(
        (a, b) =>
          pointDistance(a, { x: segment.x1, y: segment.y1 }) -
          pointDistance(b, { x: segment.x1, y: segment.y1 })
      );
    }

    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = ordered[i];
      const to = ordered[i + 1];
      if (from.x === to.x && from.y === to.y) continue;
      const a = ensureNode(from.x, from.y);
      const b = ensureNode(to.x, to.y);
      addEdge(a, b);
    }
  });

  return { nodes, adjacency };
}

function findNearestGraphNode(nodes, candidate, maxDistance) {
  let best = null;
  nodes.forEach((node, idx) => {
    const dist = pointDistance(node, candidate);
    if (dist > maxDistance) return;
    if (!best || dist < best.distance) {
      best = { index: idx, distance: dist, point: node };
    }
  });
  return best;
}

function findNearestGraphNodeForCandidates(nodes, candidates, maxDistance) {
  for (let i = 0; i < candidates.length; i += 1) {
    const match = findNearestGraphNode(nodes, candidates[i], maxDistance);
    if (match) return match;
  }
  return null;
}

function shortestPathInConnectorGraph(graph, startIndex, endIndex) {
  if (startIndex === endIndex) return [startIndex];

  const { adjacency } = graph;
  const visited = new Set();
  const distances = new Map([[startIndex, 0]]);
  const previous = new Map();
  const queue = [{ index: startIndex, distance: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (!current || visited.has(current.index)) continue;
    visited.add(current.index);
    if (current.index === endIndex) break;

    const neighbors = adjacency.get(current.index) || [];
    neighbors.forEach((neighbor) => {
      if (visited.has(neighbor.to)) return;
      const nextDistance =
        current.distance +
        (Number.isFinite(neighbor.weight) ? neighbor.weight : 1);
      const knownDistance = distances.get(neighbor.to);
      if (knownDistance === undefined || nextDistance < knownDistance) {
        distances.set(neighbor.to, nextDistance);
        previous.set(neighbor.to, current.index);
        queue.push({ index: neighbor.to, distance: nextDistance });
      }
    });
  }

  if (!previous.has(endIndex)) return null;
  const route = [endIndex];
  let cursor = endIndex;
  while (cursor !== startIndex) {
    cursor = previous.get(cursor);
    if (cursor === undefined) return null;
    route.push(cursor);
  }
  route.reverse();
  return route;
}

function getCandidateNodeMatches(nodes, candidates, maxDistance) {
  const matches = [];
  const seen = new Set();
  candidates.forEach((candidate) => {
    const match = findNearestGraphNode(nodes, candidate, maxDistance);
    if (!match) return;
    const key = String(match.index);
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(match);
  });
  return matches;
}

function measureRouteLength(nodes, route) {
  let length = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = nodes[route[i]];
    const b = nodes[route[i + 1]];
    length += pointManhattanDistance(a, b);
  }
  return length;
}

function findBestConnectorRoute(
  graph,
  fromCandidates,
  toCandidates,
  maxDistance
) {
  const fromMatches = getCandidateNodeMatches(
    graph.nodes,
    fromCandidates,
    maxDistance
  );
  const toMatches = getCandidateNodeMatches(
    graph.nodes,
    toCandidates,
    maxDistance
  );

  let best = null;
  fromMatches.forEach((fromMatch) => {
    toMatches.forEach((toMatch) => {
      const route = shortestPathInConnectorGraph(
        graph,
        fromMatch.index,
        toMatch.index
      );
      if (!route || route.length === 0) return;
      const routeLength = measureRouteLength(graph.nodes, route);
      const score = routeLength + fromMatch.distance + toMatch.distance;
      if (!best || score < best.score) {
        best = {
          score,
          route,
          fromMatch,
          toMatch,
        };
      }
    });
  });

  return best;
}

function buildFallbackRelationPath(step, startPoint, endPoint) {
  if (step.kind === 'spouse') {
    return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
  }
  const turnY = (startPoint.y + endPoint.y) / 2;
  return `M ${startPoint.x} ${startPoint.y} L ${startPoint.x} ${turnY} L ${endPoint.x} ${turnY} L ${endPoint.x} ${endPoint.y}`;
}

function getNodeBoxInTreeSpace(el, treeRect, zoom) {
  const rect = el.getBoundingClientRect();
  const left = (rect.left - treeRect.left) / zoom;
  const top = (rect.top - treeRect.top) / zoom;
  const width = rect.width / zoom;
  const height = rect.height / zoom;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function getRelationAnchorCandidates(step, fromBox, toBox) {
  const fromCenter = { x: fromBox.centerX, y: fromBox.centerY };
  const toCenter = { x: toBox.centerX, y: toBox.centerY };
  const defaultFrom = [
    fromCenter,
    { x: fromBox.centerX, y: fromBox.bottom },
    { x: fromBox.centerX, y: fromBox.top },
    { x: fromBox.right, y: fromBox.centerY },
    { x: fromBox.left, y: fromBox.centerY },
  ];
  const defaultTo = [
    toCenter,
    { x: toBox.centerX, y: toBox.top },
    { x: toBox.centerX, y: toBox.bottom },
    { x: toBox.left, y: toBox.centerY },
    { x: toBox.right, y: toBox.centerY },
  ];

  if (step.kind === 'spouse') {
    const fromIsLeft = fromBox.centerX <= toBox.centerX;
    return {
      from: fromIsLeft
        ? [{ x: fromBox.right, y: fromBox.centerY }, ...defaultFrom]
        : [{ x: fromBox.left, y: fromBox.centerY }, ...defaultFrom],
      to: fromIsLeft
        ? [{ x: toBox.left, y: toBox.centerY }, ...defaultTo]
        : [{ x: toBox.right, y: toBox.centerY }, ...defaultTo],
    };
  }

  if (step.kind === 'parent' && step.dir === 'to_child') {
    return {
      from: [{ x: fromBox.centerX, y: fromBox.bottom }, ...defaultFrom],
      to: [{ x: toBox.centerX, y: toBox.top }, ...defaultTo],
    };
  }

  if (step.kind === 'parent' && step.dir === 'to_parent') {
    return {
      from: [{ x: fromBox.centerX, y: fromBox.top }, ...defaultFrom],
      to: [{ x: toBox.centerX, y: toBox.bottom }, ...defaultTo],
    };
  }

  return { from: defaultFrom, to: defaultTo };
}

const DIRECTION_OPTIONS = [
  { value: 'both', label: 'Leluhur & keturunan' },
  { value: 'down', label: 'Keturunan saja' },
  { value: 'up', label: 'Leluhur saja' },
];

const EXPORT_SIZE_OPTIONS = [
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
  { value: 'A2', label: 'A2' },
];

function SearchableSelect({ id, value, onChange, options, placeholder }) {
  const [open, setOpen] = React.useState(false);
  const [term, setTerm] = React.useState('');
  const current = options.find((o) => o.value === value);
  const displayLabel = current ? current.label : placeholder || 'Pilih...';
  const filteredOptions = React.useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => o.label.toLowerCase().includes(t));
  }, [options, term]);
  return (
    <div className="ft-filter-pair">
      <button
        id={id}
        type="button"
        className="chart-toolbar-select ft-filter-pair-display"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{displayLabel}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="ft-filter-pair-popover">
          <div className="search-panel">
            <input
              className="search-input"
              type="text"
              placeholder="Ketik untuk mencari..."
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoFocus
            />
            <div className="search-results">
              {filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setTerm('');
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FamilyTree = memo(
  forwardRef(function FamilyTree(
    { roots, persons, highlightedIds, onSelectPerson, selectedId, onAddPerson },
    ref
  ) {
    const containerRef = useRef(null);
    const treeRef = useRef(null);

    // Transform is kept in refs and applied directly to DOM to avoid full tree re-render each gesture frame.
    const transformRef = useRef({ x: 0, y: 0, zoom: 0.5 });
    const panzoomRef = useRef(null);
    const transformIdleTimerRef = useRef(null);
    const initialFittedRef = useRef(false);
    const [isTransforming, setIsTransforming] = useState(false);
    const isTransformingRef = useRef(false);
    const [zoomDisplay, setZoomDisplay] = useState(50);
    const zoomDisplayRafRef = useRef(null);

    const snapToDevicePixel = useCallback((value) => {
      const dpr =
        typeof window !== 'undefined' &&
        Number.isFinite(window.devicePixelRatio) &&
        window.devicePixelRatio > 0
          ? window.devicePixelRatio
          : 1;
      return Math.round(value * dpr) / dpr;
    }, []);

    const normalizeTransform = useCallback(
      (next) => {
        if (!next) return transformRef.current;
        const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next.zoom));
        const roundedZoom = Number(clampedZoom.toFixed(ZOOM_PRECISION));
        return {
          x: snapToDevicePixel(next.x),
          y: snapToDevicePixel(next.y),
          zoom: roundedZoom,
        };
      },
      [snapToDevicePixel]
    );

    const applyTransformToTree = useCallback((next) => {
      const treeEl = treeRef.current;
      if (!treeEl) return;
      treeEl.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`;
      treeEl.style.transformOrigin = 'top left';
      treeEl.style.willChange = isTransformingRef.current
        ? 'transform'
        : 'auto';
    }, []);

    const scheduleZoomDisplayUpdate = useCallback((zoom) => {
      if (zoomDisplayRafRef.current) return;
      zoomDisplayRafRef.current = requestAnimationFrame(() => {
        setZoomDisplay(Math.round(zoom * 100));
        zoomDisplayRafRef.current = null;
      });
    }, []);

    const scheduleTransformIdle = useCallback(() => {
      if (transformIdleTimerRef.current) {
        clearTimeout(transformIdleTimerRef.current);
      }
      transformIdleTimerRef.current = setTimeout(() => {
        isTransformingRef.current = false;
        setIsTransforming(false);
        // When panzoom is active, it already owns transform writes.
        if (!panzoomRef.current) {
          applyTransformToTree(transformRef.current);
        }
        transformIdleTimerRef.current = null;
      }, TRANSFORM_IDLE_DELAY_MS);
    }, [applyTransformToTree]);

    const commitTransform = useCallback(
      (nextOrUpdater) => {
        const base = transformRef.current;
        const nextRaw =
          typeof nextOrUpdater === 'function'
            ? nextOrUpdater(base)
            : nextOrUpdater;
        const next = normalizeTransform(nextRaw);

        const panzoom = panzoomRef.current;
        if (panzoom) {
          panzoom.zoomAbs(0, 0, next.zoom);
          panzoom.moveTo(next.x, next.y);
          return;
        }

        transformRef.current = next;
        if (!isTransformingRef.current) {
          isTransformingRef.current = true;
          setIsTransforming(true);
        }
        applyTransformToTree(next);
        scheduleZoomDisplayUpdate(next.zoom);
        scheduleTransformIdle();
      },
      [
        normalizeTransform,
        applyTransformToTree,
        scheduleZoomDisplayUpdate,
        scheduleTransformIdle,
      ]
    );

    useEffect(() => {
      applyTransformToTree(transformRef.current);
      setZoomDisplay(Math.round(transformRef.current.zoom * 100));
    }, [applyTransformToTree]);

    useEffect(
      () => () => {
        if (transformIdleTimerRef.current) {
          clearTimeout(transformIdleTimerRef.current);
        }
        if (zoomDisplayRafRef.current) {
          cancelAnimationFrame(zoomDisplayRafRef.current);
          zoomDisplayRafRef.current = null;
        }
      },
      []
    );

    const [exportSize, setExportSize] = useState('A3');
    const [exportError, setExportError] = useState('');
    const [exporting, setExporting] = useState(false);
    const [dualLines, setDualLines] = useState([]);
    const [dualCanvas, setDualCanvas] = useState({ width: 0, height: 0 }); // Kept for backwards compatibility if needed elsewhere
    const [pathLines, setPathLines] = useState([]);
    const [pairKey, setPairKey] = useState('');
    const [direction, setDirection] = useState('both');
    const [generationFilter, setGenerationFilter] = useState('all');
    const [relationAId, setRelationAId] = useState(() => {
      if (typeof window === 'undefined') return '';
      const params = new URLSearchParams(window.location.search);
      return params.get('a') || '';
    });
    const [relationBId, setRelationBId] = useState(() => {
      if (typeof window === 'undefined') return '';
      const params = new URLSearchParams(window.location.search);
      return params.get('b') || '';
    });
    const [relationKinds, setRelationKinds] = useState({
      parent: true,
      spouse: true,
    });
    const [relationExporting, setRelationExporting] = useState(false);
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [showRelationPanel, setShowRelationPanel] = useState(false);
    const relationRef = useRef(null);

    const getInteractionProfile = useCallback(() => {
      if (typeof window === 'undefined') {
        return {
          mobileLike: false,
          zoomSpeed: 0.07,
          pinchSpeed: 1.35,
          smoothScroll: true,
        };
      }

      const coarsePointer =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(pointer: coarse)').matches
          : false;
      const touchPoints = Number(navigator.maxTouchPoints || 0);
      const mobileViewport = window.innerWidth <= 900;
      const mobileLike = coarsePointer && touchPoints > 0 && mobileViewport;

      return {
        mobileLike,
        // Lower wheel speed on mobile-like devices to avoid jumpy zoom.
        zoomSpeed: mobileLike ? 0.045 : 0.07,
        // Tune pinch sensitivity to feel controlled on phones.
        pinchSpeed: mobileLike ? 1.15 : 1.35,
        // Desktop gets smooth wheel inertia, mobile stays direct and stable.
        smoothScroll: !mobileLike,
      };
    }, []);

    // ===== Panzoom Engine =====
    useEffect(() => {
      const treeEl = treeRef.current;
      if (!treeEl) return undefined;

      const profile = getInteractionProfile();

      const panzoom = createPanZoom(treeEl, {
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        zoomSpeed: profile.zoomSpeed,
        pinchSpeed: profile.pinchSpeed,
        smoothScroll: profile.smoothScroll,
        disableKeyboardInteraction: true,
        // Ignore wheel gestures for mobile-like devices; keep desktop wheel zoom.
        beforeWheel: () => profile.mobileLike,
        // Preserve click/tap behavior on person cards and UI controls.
        beforeMouseDown: (e) => {
          const target = e.target instanceof Element ? e.target : null;
          if (!target) return false;
          return Boolean(
            target.closest('[data-person-id]') ||
            target.closest('button, input, select, textarea, a, label') ||
            target.closest('.ft-filter-panel, .ft-relation-panel')
          );
        },
        onTouch: (e) => {
          const target = e.target instanceof Element ? e.target : null;
          if (!target) return true;
          // Return false to prevent panzoom from preventing default/propagation
          // so taps on cards still fire normal click handlers on mobile.
          if (target.closest('[data-person-id]')) return false;
          if (target.closest('button, input, select, textarea, a, label'))
            return false;
          if (target.closest('.ft-filter-panel, .ft-relation-panel'))
            return false;
          return true;
        },
        onDoubleClick: () => true,
      });

      panzoomRef.current = panzoom;

      // Ensure engine starts from current transform values.
      const initial = transformRef.current;
      panzoom.zoomAbs(0, 0, initial.zoom);
      panzoom.moveTo(initial.x, initial.y);

      const onTransform = () => {
        const tr = panzoom.getTransform();
        // Avoid snapping/re-applying transform here to prevent feedback jitter.
        const next = { x: tr.x, y: tr.y, zoom: tr.scale };
        transformRef.current = next;
        if (!isTransformingRef.current) {
          isTransformingRef.current = true;
          setIsTransforming(true);
        }
        scheduleZoomDisplayUpdate(next.zoom);
        scheduleTransformIdle();
      };

      panzoom.on('transform', onTransform);

      return () => {
        panzoom.off('transform', onTransform);
        panzoom.dispose();
        if (panzoomRef.current === panzoom) {
          panzoomRef.current = null;
        }
      };
    }, [
      applyTransformToTree,
      getInteractionProfile,
      normalizeTransform,
      scheduleTransformIdle,
      scheduleZoomDisplayUpdate,
    ]);

    const animateTransform = useCallback(
      (newX, newY, newZoom) => {
        const normalized = normalizeTransform({
          x: newX,
          y: newY,
          zoom: newZoom,
        });
        const panzoom = panzoomRef.current;
        if (panzoom) {
          const rect = containerRef.current?.getBoundingClientRect();
          const focalX = rect ? rect.left + rect.width / 2 : 0;
          const focalY = rect ? rect.top + rect.height / 2 : 0;
          panzoom.smoothZoomAbs(focalX, focalY, normalized.zoom);
          panzoom.smoothMoveTo(normalized.x, normalized.y);
          return;
        }
        commitTransform(normalized);
      },
      [normalizeTransform, commitTransform]
    );

    // ===== Focus on Node =====
    const focusOnNode = useCallback(
      (nodeId) => {
        const card = containerRef.current?.querySelector(
          `[data-person-id="${nodeId}"]`
        );
        if (!card) return;

        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();

        const cardCenterX =
          cardRect.left + cardRect.width / 2 - containerRect.left;
        const cardCenterY =
          cardRect.top + cardRect.height / 2 - containerRect.top;

        const containerCenterX = containerRect.width / 2;
        const containerCenterY = containerRect.height / 2;

        const cur = transformRef.current;
        const cardTreeX = (cardCenterX - cur.x) / cur.zoom;
        const cardTreeY = (cardCenterY - cur.y) / cur.zoom;

        const newZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, FOCUS_ZOOM_LEVEL)
        );

        const newX = containerCenterX - cardTreeX * newZoom;
        const newY = containerCenterY - cardTreeY * newZoom;

        animateTransform(newX, newY, newZoom);
      },
      [animateTransform]
    );

    // ===== Double-Click to Fit =====
    const handleDoubleClick = useCallback(
      (e) => {
        const card = e.target.closest('[data-person-id]');
        if (card) {
          const personId = card.getAttribute('data-person-id');
          focusOnNode(personId);
        }
      },
      [focusOnNode]
    );

    // ===== Focus on selected card =====
    useEffect(() => {
      if (!selectedId) return;
      focusOnNode(selectedId);
    }, [selectedId, focusOnNode]);

    // ===== Zoom Buttons =====
    const zoomIn = () => {
      const cur = transformRef.current;
      const newZoom = Math.min(
        MAX_ZOOM,
        Math.round((cur.zoom + ZOOM_STEP) * 100) / 100
      );
      animateTransform(cur.x, cur.y, newZoom);
    };

    const zoomOut = () => {
      const cur = transformRef.current;
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.round((cur.zoom - ZOOM_STEP) * 100) / 100
      );
      animateTransform(cur.x, cur.y, newZoom);
    };

    const zoomReset = () => {
      animateTransform(0, 0, 0.5);
    };

    // ===== Imperative Handle (for ActionSheet in App) =====
    useImperativeHandle(ref, () => ({
      zoomIn,
      zoomOut,
      zoomReset,
      openFilter: () => setShowFilterPanel(true),
      closeFilter: () => setShowFilterPanel(false),
      openRelation: () => setShowRelationPanel(true),
      closeRelation: () => setShowRelationPanel(false),
      handleExport,
      getCurrentZoom: () => transformRef.current.zoom,
      getExportSize: () => exportSize,
      setExportSize: (v) => setExportSize(v),
    }));

    // ===== Dual Connections Effect =====
    const dualConnections = React.useMemo(() => {
      const list = [];
      const walk = (unit) => {
        if (unit?.dualConnection && unit.wife?.id) {
          list.push({
            unitId: unit.id,
            wifeId: unit.wife.id,
            parentUnitId: unit.dualConnection.wifeParentUnitId,
          });
        }
        if (unit.children) {
          unit.children.forEach(walk);
        }
        if (unit.marriages) {
          unit.marriages.forEach((marriage) => {
            if (marriage.children) marriage.children.forEach(walk);
          });
        }
      };
      roots.forEach(walk);
      return list;
    }, [roots]);

    useEffect(() => {
      const treeEl = treeRef.current;
      if (!treeEl || dualConnections.length === 0) {
        setDualLines([]);
        return;
      }
      const update = () => {
        const rect = treeEl.getBoundingClientRect();
        const zoom = transformRef.current.zoom;
        const lines = [];
        dualConnections.forEach((conn) => {
          const wifeEl = treeEl.querySelector(
            `[data-person-id="${conn.wifeId}"]`
          );
          const parentUnitEl = treeEl.querySelector(
            `[data-unit-id="${conn.parentUnitId}"]`
          );
          const parentCoupleEl = parentUnitEl?.querySelector(
            '[data-unit-couple="true"]'
          );
          if (!wifeEl || !parentCoupleEl) return;
          const wifeRect = wifeEl.getBoundingClientRect();
          const parentRect = parentCoupleEl.getBoundingClientRect();
          lines.push({
            key: `dual-${conn.unitId}`,
            x1: (wifeRect.left + wifeRect.width / 2 - rect.left) / zoom,
            y1: (wifeRect.top + wifeRect.height / 2 - rect.top) / zoom,
            x2: (parentRect.left + parentRect.width / 2 - rect.left) / zoom,
            y2: (parentRect.top + parentRect.height / 2 - rect.top) / zoom,
          });
        });
        setDualLines(lines);
        setDualCanvas({ width: rect.width / zoom, height: rect.height / zoom });
      };

      const timer = setTimeout(update, 50); // Small delay to ensure layout is ready
      const onResize = () => update();
      window.addEventListener('resize', onResize);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', onResize);
      };
    }, [dualConnections]);

    // ===== Export =====
    const handleExport = useCallback(
      async (format) => {
        if (!treeRef.current) return;
        const { width: paperW, height: paperH } = PAPER_SIZES[exportSize];
        setExporting(true);
        setExportError('');
        const treeEl = treeRef.current;
        const savedTransform = treeEl.style.transform;
        const savedTransformOrigin = treeEl.style.transformOrigin;
        try {
          treeEl.style.transform = 'none';
          treeEl.style.transformOrigin = 'top left';

          await new Promise((r) => requestAnimationFrame(r));
          await new Promise((r) => requestAnimationFrame(r));

          const naturalW = treeEl.scrollWidth;
          const naturalH = treeEl.scrollHeight;
          const scale = Math.min(paperW / naturalW, paperH / naturalH) * 0.92;
          const deviceScale = window.devicePixelRatio || 1;
          const pixelRatio = Math.min(6, Math.max(2, scale * 3 * deviceScale));

          const opts = {
            pixelRatio,
            skipFonts: true,
            imagePlaceholder:
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23e2e8f0'/%3E%3C/svg%3E",
          };

          let dataUrl;
          if (format === 'png') {
            dataUrl = await toPng(treeEl, opts);
          } else {
            dataUrl = await toSvg(treeEl, opts);
          }
          downloadDataUrl(
            dataUrl,
            `silsilah-baniakhzab-${exportSize}.${format}`
          );
        } catch (err) {
          setExportError(err instanceof Error ? err.message : 'Gagal ekspor.');
        } finally {
          treeEl.style.transform = savedTransform;
          treeEl.style.transformOrigin = savedTransformOrigin;
          setExporting(false);
        }
      },
      [exportSize]
    );

    // ===== Filter Context =====
    const filterContext = React.useMemo(() => {
      if (!persons) return null;
      const genById = new Map();
      const childrenByParent = new Map();
      const spousePairs = [];

      persons.forEach((p) => {
        const genNum = parseGenerationNumber(p.generation);
        genById.set(p.id, genNum);
        if (p.fatherId) {
          if (!childrenByParent.has(p.fatherId)) {
            childrenByParent.set(p.fatherId, new Set());
          }
          childrenByParent.get(p.fatherId).add(p.id);
        }
        if (p.motherId) {
          if (!childrenByParent.has(p.motherId)) {
            childrenByParent.set(p.motherId, new Set());
          }
          childrenByParent.get(p.motherId).add(p.id);
        }
      });

      persons.forEach((p) => {
        p.spouseIds.forEach((sid) => {
          if (p.id < sid) {
            const other = persons.get(sid);
            if (!other) return;
            spousePairs.push({
              key: `${p.id}:${sid}`,
              label: `${p.name} · ${other.name}`,
              a: p.id,
              b: sid,
            });
          }
        });
      });

      const generations = new Set();
      genById.forEach((g) => {
        if (g != null) generations.add(g);
      });

      return {
        persons,
        genById,
        childrenByParent,
        spousePairs,
        generationOptions: Array.from(generations).sort((a, b) => a - b),
      };
    }, [persons]);

    const pairOptions = React.useMemo(() => {
      if (!filterContext) return [];
      const base = [
        { value: '', label: 'Semua pasangan' },
        ...filterContext.spousePairs.map((p) => ({
          value: p.key,
          label: p.label,
        })),
      ];
      return base;
    }, [filterContext]);

    const visibleIds = React.useMemo(() => {
      if (!filterContext) return null;
      const { persons, genById, childrenByParent } = filterContext;
      let baseVisible = null;

      if (pairKey) {
        const [a, b] = pairKey.split(':');
        const focusIds = [a, b].filter(Boolean);
        const result = new Set(focusIds);

        const visitDesc = (id) => {
          const children = childrenByParent.get(id);
          if (!children) return;
          children.forEach((cid) => {
            if (!result.has(cid)) {
              result.add(cid);
              visitDesc(cid);
            }
          });
        };

        const visitAnc = (id) => {
          const p = persons.get(id);
          if (!p) return;
          const parents = [p.fatherId, p.motherId].filter(Boolean);
          parents.forEach((pid) => {
            if (!result.has(pid)) {
              result.add(pid);
              visitAnc(pid);
            }
          });
        };

        if (direction === 'down' || direction === 'both') {
          focusIds.forEach((id) => visitDesc(id));
        }
        if (direction === 'up' || direction === 'both') {
          focusIds.forEach((id) => visitAnc(id));
        }

        const withSpouses = new Set(result);
        result.forEach((id) => {
          const p = persons.get(id);
          if (!p) return;
          p.spouseIds.forEach((sid) => withSpouses.add(sid));
        });

        baseVisible = withSpouses;
      }

      if (generationFilter !== 'all') {
        const genNum = Number(generationFilter);
        const filtered = new Set();
        const source = baseVisible || new Set(Array.from(persons.keys()));
        source.forEach((id) => {
          const g = genById.get(id);
          if (g === genNum) filtered.add(id);
        });
        baseVisible = filtered;
      }

      if (!baseVisible) return null;
      return baseVisible;
    }, [filterContext, pairKey, direction, generationFilter]);

    const generationSelectOptions = React.useMemo(() => {
      if (!filterContext) return [{ value: 'all', label: 'Semua' }];
      const base = [{ value: 'all', label: 'Semua' }];
      filterContext.generationOptions.forEach((g) => {
        base.push({ value: String(g), label: `G${g}` });
      });
      return base;
    }, [filterContext]);

    const filterStatusLabel = React.useMemo(() => {
      if (!filterContext) return 'Semua anggota keluarga';
      const parts = [];
      if (pairKey) {
        const pair = filterContext.spousePairs.find((p) => p.key === pairKey);
        if (pair) parts.push(`Pasangan: ${pair.label}`);
      }
      if (direction && pairKey) {
        if (direction === 'down') parts.push('Arah: Keturunan');
        else if (direction === 'up') parts.push('Arah: Leluhur');
        else parts.push('Arah: Leluhur & keturunan');
      }
      if (generationFilter !== 'all') {
        parts.push(`Generasi: G${generationFilter}`);
      }
      if (parts.length === 0) return 'Semua anggota keluarga';
      return parts.join(' · ');
    }, [filterContext, pairKey, direction, generationFilter]);

    const personOptions = React.useMemo(() => {
      if (!persons) return [];
      const arr = [];
      persons.forEach((p) => {
        arr.push({ id: p.id, name: p.name || p.id });
      });
      arr.sort((a, b) => a.name.localeCompare(b.name, 'id'));
      return arr;
    }, [persons]);

    const relationResult = React.useMemo(() => {
      if (!persons || !relationAId || !relationBId) {
        return { paths: [], shortestLength: null };
      }
      return findRelationPaths(
        persons,
        relationAId,
        relationBId,
        relationKinds
      );
    }, [persons, relationAId, relationBId, relationKinds]);

    const relationHighlightIds = React.useMemo(() => {
      if (
        !relationResult ||
        !relationResult.paths ||
        relationResult.paths.length === 0
      ) {
        return null;
      }
      const s = new Set();
      relationResult.paths.forEach((p) => {
        p.nodes.forEach((id) => s.add(id));
      });
      return s;
    }, [relationResult]);

    const combinedHighlightedIds = React.useMemo(() => {
      if (!highlightedIds && !relationHighlightIds) return null;
      if (!highlightedIds) return relationHighlightIds;
      if (!relationHighlightIds) return highlightedIds;
      const s = new Set(highlightedIds);
      relationHighlightIds.forEach((id) => s.add(id));
      return s;
    }, [highlightedIds, relationHighlightIds]);

    const graphVisibleIds = React.useMemo(() => {
      return visibleIds;
    }, [visibleIds]);

    const filteredRoots = React.useMemo(() => {
      if (!roots) return [];
      if (!graphVisibleIds) return roots;

      const filterUnit = (unit) => {
        if (unit.isStub) {
          const visible = graphVisibleIds.has(unit.stubPerson.id);
          return visible ? unit : null;
        }

        if (unit.isPolygamous) {
          const filteredMarriages = unit.marriages
            .map((m) => {
              const filteredChildren = (m.children || [])
                .map(filterUnit)
                .filter(Boolean);
              const wifeVisible = graphVisibleIds.has(m.wife.id);
              if (!wifeVisible && filteredChildren.length === 0) return null;
              return { ...m, children: filteredChildren };
            })
            .filter(Boolean);

          const husbandVisible = unit.husband
            ? graphVisibleIds.has(unit.husband.id)
            : false;

          if (!husbandVisible && filteredMarriages.length === 0) return null;

          return {
            ...unit,
            marriages: filteredMarriages,
          };
        }

        const filteredChildren = (unit.children || [])
          .map(filterUnit)
          .filter(Boolean);

        const hasVisibleSelf =
          (unit.husband && graphVisibleIds.has(unit.husband.id)) ||
          (unit.wife && graphVisibleIds.has(unit.wife.id));

        if (!hasVisibleSelf && filteredChildren.length === 0) return null;

        return {
          ...unit,
          children: filteredChildren,
        };
      };

      return roots.map((r) => filterUnit(r)).filter(Boolean);
    }, [roots, graphVisibleIds]);

    // ===== Relation Path Visually Highlight Effect =====
    useEffect(() => {
      const treeEl = treeRef.current;
      if (
        !treeEl ||
        !relationResult ||
        !relationResult.paths ||
        relationResult.paths.length === 0
      ) {
        setPathLines([]);
        return;
      }

      const update = () => {
        const treeRect = treeEl.getBoundingClientRect();
        const zoom = transformRef.current.zoom || 1;
        const shortestPath = relationResult.paths[0]; // highlight shortest path only
        if (
          !shortestPath ||
          !shortestPath.steps ||
          shortestPath.steps.length === 0
        ) {
          setPathLines([]);
          return;
        }

        const connectorSegments = [];
        const connectorLineElements = treeEl.querySelectorAll(
          '.fu-wrapper svg line'
        );
        connectorLineElements.forEach((lineEl) => {
          const svgEl = lineEl.ownerSVGElement;
          if (!svgEl) return;

          const x1 = Number(lineEl.getAttribute('x1'));
          const y1 = Number(lineEl.getAttribute('y1'));
          const x2 = Number(lineEl.getAttribute('x2'));
          const y2 = Number(lineEl.getAttribute('y2'));
          if (![x1, y1, x2, y2].every(Number.isFinite)) return;

          const svgRect = svgEl.getBoundingClientRect();
          const svgOffsetX = (svgRect.left - treeRect.left) / zoom;
          const svgOffsetY = (svgRect.top - treeRect.top) / zoom;

          connectorSegments.push({
            x1: svgOffsetX + x1,
            y1: svgOffsetY + y1,
            x2: svgOffsetX + x2,
            y2: svgOffsetY + y2,
          });
        });

        const connectorGraph = buildConnectorGraph(connectorSegments);
        const lines = [];

        shortestPath.steps.forEach((step, i) => {
          const fromEl = treeEl.querySelector(
            `[data-person-id="${step.fromId}"]`
          );
          const toEl = treeEl.querySelector(`[data-person-id="${step.toId}"]`);
          if (!fromEl || !toEl) return;

          const fromBox = getNodeBoxInTreeSpace(fromEl, treeRect, zoom);
          const toBox = getNodeBoxInTreeSpace(toEl, treeRect, zoom);
          const anchorCandidates = getRelationAnchorCandidates(
            step,
            fromBox,
            toBox
          );

          const fromMatch = findNearestGraphNodeForCandidates(
            connectorGraph.nodes,
            anchorCandidates.from,
            CONNECTOR_NEAREST_MAX_DISTANCE
          );
          const toMatch = findNearestGraphNodeForCandidates(
            connectorGraph.nodes,
            anchorCandidates.to,
            CONNECTOR_NEAREST_MAX_DISTANCE
          );
          const bestRoute = findBestConnectorRoute(
            connectorGraph,
            anchorCandidates.from,
            anchorCandidates.to,
            CONNECTOR_NEAREST_MAX_DISTANCE
          );

          const fallbackStart =
            bestRoute?.fromMatch?.point ||
            fromMatch?.point ||
            anchorCandidates.from[0];
          const fallbackEnd =
            bestRoute?.toMatch?.point ||
            toMatch?.point ||
            anchorCandidates.to[0];

          let d = '';
          if (bestRoute?.route && bestRoute.route.length > 0) {
            d = bestRoute.route
              .map((nodeIndex, pathIndex) => {
                const p = connectorGraph.nodes[nodeIndex];
                return `${pathIndex === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
              })
              .join(' ');
          }

          if (!d) {
            d = buildFallbackRelationPath(step, fallbackStart, fallbackEnd);
          }

          lines.push({
            key: `path-${step.fromId}-${step.toId}-${i}`,
            d,
          });
        });

        setPathLines(lines);
      };

      let rafId = null;
      const timer = setTimeout(() => {
        rafId = requestAnimationFrame(update);
      }, 50);
      const onResize = () => update();
      window.addEventListener('resize', onResize);
      return () => {
        clearTimeout(timer);
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
      };
    }, [relationResult, filteredRoots]);

    // ===== Initial Auto-Center =====
    useEffect(() => {
      if (
        initialFittedRef.current ||
        !filteredRoots ||
        filteredRoots.length === 0
      )
        return;

      let rafId = null;

      const checkAndFit = () => {
        if (
          initialFittedRef.current ||
          !containerRef.current ||
          !treeRef.current
        )
          return;

        const container = containerRef.current;
        const tree = treeRef.current;

        const containerW = container.clientWidth;
        const containerH = container.clientHeight;
        const treeW = tree.scrollWidth;
        const treeH = tree.scrollHeight;

        if (treeW === 0 || treeH === 0) {
          // In JSDOM (testing), dimensions are always 0. Don't loop forever.
          if (
            typeof process !== 'undefined' &&
            process.env?.NODE_ENV === 'test'
          )
            return;
          // Not ready yet, check again next frame
          rafId = requestAnimationFrame(checkAndFit);
          return;
        }

        // Calculate zoom to fit
        const scaleW = containerW / treeW;
        const scaleH = containerH / treeH;
        const fitZoom = Math.min(1, scaleW, scaleH); // Max 1.0 (100%) zoom
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));

        // Calculate top-center position with top-left transform origin.
        const newX = containerW / 2 - (treeW / 2) * newZoom;
        const newY = 40; // a little top padding

        initialFittedRef.current = true;
        commitTransform({ x: newX, y: newY, zoom: newZoom });
      };

      // Delay checking slightly to ensure React has attached refs
      const timer = setTimeout(checkAndFit, 50);

      return () => {
        clearTimeout(timer);
        if (rafId) cancelAnimationFrame(rafId);
      };
    }, [filteredRoots, commitTransform]);

    const describeStep = (step) => {
      if (!step.kind) return 'Terhubung';
      if (step.kind === 'spouse') return 'Pasangan';
      if (step.kind === 'parent') {
        if (step.dir === 'to_parent') return 'Anak → orang tua';
        if (step.dir === 'to_child') return 'Orang tua → anak';
      }
      return 'Relasi';
    };

    const getPersonName = (id) => {
      if (!persons) return id;
      const p = persons.get(id);
      return p ? p.name : id;
    };

    if (!filteredRoots || filteredRoots.length === 0) {
      return (
        <div className="state-box">
          <span>Tidak ada data silsilah ditemukan.</span>
        </div>
      );
    }

    return (
      <div className="ft-shell">
        {/* Floating ZoomMiniBar — always visible, bottom-left */}
        <div className="ft-zoom-minibar">
          <button
            type="button"
            className="ft-zoom-btn"
            onClick={zoomOut}
            title="Perkecil"
          >
            −
          </button>
          <span className="ft-zoom-label">{zoomDisplay}%</span>
          <button
            type="button"
            className="ft-zoom-btn"
            onClick={zoomIn}
            title="Perbesar"
          >
            +
          </button>
          <button
            type="button"
            className="ft-zoom-btn"
            onClick={zoomReset}
            title="Reset zoom"
          >
            ⊙
          </button>
        </div>

        {/* Floating filter panel */}
        {showFilterPanel && filterContext && (
          <>
            <div
              className="ft-filter-panel-backdrop"
              onClick={() => setShowFilterPanel(false)}
            />
            <div className="ft-filter-panel">
              <div className="ft-relation-header">
                <span className="chart-toolbar-label">Filter Silsilah</span>
                <button
                  type="button"
                  className="ft-relation-close-btn"
                  onClick={() => setShowFilterPanel(false)}
                >
                  ✕
                </button>
              </div>
              <label className="chart-toolbar-label" htmlFor="ft-filter-pair">
                Pasangan
              </label>
              <SearchableSelect
                id="ft-filter-pair"
                value={pairKey}
                onChange={(val) => setPairKey(val)}
                options={pairOptions}
                placeholder="Semua pasangan"
              />
              <label
                className="chart-toolbar-label"
                htmlFor="ft-filter-direction"
              >
                Arah
              </label>
              <SearchableSelect
                id="ft-filter-direction"
                value={direction}
                onChange={(val) => setDirection(val)}
                options={DIRECTION_OPTIONS}
                placeholder="Pilih arah"
              />
              <label
                className="chart-toolbar-label"
                htmlFor="ft-filter-generation"
              >
                Generasi
              </label>
              <SearchableSelect
                id="ft-filter-generation"
                value={generationFilter}
                onChange={(val) => setGenerationFilter(val)}
                options={generationSelectOptions}
                placeholder="Semua generasi"
              />
              <span className="chart-toolbar-label" style={{ marginTop: 4 }}>
                {filterStatusLabel}
              </span>
            </div>
          </>
        )}

        {/* Floating relation panel */}
        {showRelationPanel && (
          <div
            ref={relationRef}
            className="ft-relation-panel"
            style={{ width: 'fit-content' }}
          >
            <div className="ft-relation-header">
              <span className="chart-toolbar-label">
                Jalur hubungan antara dua entitas
              </span>
              <button
                type="button"
                className="ft-relation-close-btn"
                onClick={() => setShowRelationPanel(false)}
              >
                ✕
              </button>
            </div>
            <div className="ft-relation-form">
              <div className="ft-relation-field">
                <label className="chart-toolbar-label" htmlFor="ft-relation-a">
                  Entitas A
                </label>
                <SearchableSelect
                  id="ft-relation-a"
                  value={relationAId}
                  onChange={(val) => setRelationAId(val)}
                  options={[
                    { value: '', label: 'Pilih entitas…' },
                    ...personOptions.map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                  placeholder="Pilih entitas…"
                />
              </div>
              <div className="ft-relation-field">
                <label className="chart-toolbar-label" htmlFor="ft-relation-b">
                  Entitas B
                </label>
                <SearchableSelect
                  id="ft-relation-b"
                  value={relationBId}
                  onChange={(val) => setRelationBId(val)}
                  options={[
                    { value: '', label: 'Pilih entitas…' },
                    ...personOptions.map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                  placeholder="Pilih entitas…"
                />
              </div>
              <div className="ft-relation-field ft-relation-filters">
                <span className="chart-toolbar-label">Jenis hubungan</span>
                <label className="ft-relation-checkbox">
                  <input
                    type="checkbox"
                    checked={relationKinds.parent}
                    onChange={(e) =>
                      setRelationKinds((prev) => ({
                        ...prev,
                        parent: e.target.checked,
                      }))
                    }
                  />
                  <span>Orang tua/anak</span>
                </label>
                <label className="ft-relation-checkbox">
                  <input
                    type="checkbox"
                    checked={relationKinds.spouse}
                    onChange={(e) =>
                      setRelationKinds((prev) => ({
                        ...prev,
                        spouse: e.target.checked,
                      }))
                    }
                  />
                  <span>Pasangan</span>
                </label>
                {(relationAId || relationBId) && (
                  <button
                    type="button"
                    className="chart-toolbar-button secondary"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => {
                      setRelationAId('');
                      setRelationBId('');
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="ft-relation-body">
              {!relationAId || !relationBId ? (
                <div className="ft-relation-empty">
                  Pilih dua entitas untuk melihat jalur hubungan.
                </div>
              ) : !relationResult.paths || relationResult.paths.length === 0 ? (
                <div className="ft-relation-empty">
                  Tidak ada jalur hubungan yang ditemukan dengan filter saat
                  ini.
                </div>
              ) : (
                <div className="ft-relation-paths">
                  <div className="ft-relation-summary">
                    {relationResult.paths.length} jalur ditemukan · jarak
                    terpendek {relationResult.shortestLength} langkah
                  </div>
                  {relationResult.paths.map((p, idx) => (
                    <div key={p.nodes.join('->')} className="ft-relation-path">
                      <div className="ft-relation-path-header">
                        <span>
                          Jalur {idx + 1} · {p.length} langkah
                        </span>
                        {idx === 0 && (
                          <span className="ft-relation-badge">Terpendek</span>
                        )}
                      </div>
                      <div className="ft-relation-path-line">
                        <div className="ft-relation-node">
                          {getPersonName(p.nodes[0])}
                        </div>
                        {p.steps.map((step, i) => (
                          <React.Fragment
                            key={`${step.fromId}-${step.toId}-${i}`}
                          >
                            <div className="ft-relation-edge">
                              {describeStep(step)}
                            </div>
                            <div className="ft-relation-node">
                              {getPersonName(step.toId)}
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div
          ref={containerRef}
          className="ft-canvas"
          onDoubleClick={handleDoubleClick}
        >
          {onAddPerson && (
            <button
              type="button"
              className="ft-fab-add"
              onClick={onAddPerson}
              title="Tambah anggota keluarga"
              style={{ display: 'none' }}
            >
              +
            </button>
          )}
          <div
            ref={treeRef}
            className="ft-tree"
            style={{
              transformOrigin: 'top left',
              willChange: isTransforming ? 'transform' : 'auto',
            }}
          >
            {dualLines.length > 0 && (
              <svg
                className="ft-dual-svg"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
                shapeRendering="crispEdges"
                aria-hidden="true"
              >
                {dualLines.map((line) => (
                  <line
                    key={line.key}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                  />
                ))}
              </svg>
            )}
            {pathLines.length > 0 && (
              <svg
                className="ft-path-svg"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
                shapeRendering="geometricPrecision"
                aria-hidden="true"
              >
                {pathLines.map((line) => (
                  <path
                    key={line.key}
                    d={line.d}
                    fill="none"
                    className="path-highlight-line"
                  />
                ))}
              </svg>
            )}
            {filteredRoots.map((root) => (
              <FamilyUnit
                key={root.id}
                unit={root}
                highlightedIds={combinedHighlightedIds || highlightedIds}
                onSelectPerson={onSelectPerson}
                depth={0}
                relationAId={relationAId}
                relationBId={relationBId}
              />
            ))}
          </div>
        </div>
      </div>
    );
  })
);

export default FamilyTree;
