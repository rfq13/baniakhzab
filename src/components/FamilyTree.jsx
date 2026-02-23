import React, { useRef, useState, useCallback, useEffect, memo } from "react";
import { toPng, toSvg } from "html-to-image";
import FamilyUnit from "./FamilyUnit.jsx";

const PAPER_SIZES = {
  A4: { width: 3508, height: 2480 },
  A3: { width: 4961, height: 3508 },
  A2: { width: 7016, height: 4961 },
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

function parseGenerationNumber(gen) {
  if (!gen) return null;
  const m = String(gen).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

const FamilyTree = memo(function FamilyTree({
  roots,
  persons,
  highlightedIds,
  onSelectPerson,
  selectedId,
}) {
  const containerRef = useRef(null);
  const treeRef = useRef(null);

  const [zoom, setZoom] = useState(0.5);
  const [exportSize, setExportSize] = useState("A3");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [dualLines, setDualLines] = useState([]);
  const [dualCanvas, setDualCanvas] = useState({ width: 0, height: 0 });
  const [pairKey, setPairKey] = useState("");
  const [direction, setDirection] = useState("both");
  const [generationFilter, setGenerationFilter] = useState("all");
  const [pairSearchOpen, setPairSearchOpen] = useState(false);
  const [pairSearchTerm, setPairSearchTerm] = useState("");

  // Pan state
  const panRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    el.style.cursor = "grabbing";
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!panRef.current.active) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollLeft =
      panRef.current.scrollLeft - (e.clientX - panRef.current.startX);
    el.scrollTop =
      panRef.current.scrollTop - (e.clientY - panRef.current.startY);
  }, []);

  const handleMouseUp = useCallback(() => {
    panRef.current.active = false;
    if (containerRef.current) containerRef.current.style.cursor = "";
  }, []);

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
      const lines = [];
      dualConnections.forEach((conn) => {
        const wifeEl = treeEl.querySelector(
          `[data-person-id="${conn.wifeId}"]`,
        );
        const parentUnitEl = treeEl.querySelector(
          `[data-unit-id="${conn.parentUnitId}"]`,
        );
        const parentCoupleEl = parentUnitEl?.querySelector(
          '[data-unit-couple="true"]',
        );
        if (!wifeEl || !parentCoupleEl) return;
        const wifeRect = wifeEl.getBoundingClientRect();
        const parentRect = parentCoupleEl.getBoundingClientRect();
        lines.push({
          key: `dual-${conn.unitId}`,
          x1: wifeRect.left + wifeRect.width / 2 - rect.left,
          y1: wifeRect.top + wifeRect.height / 2 - rect.top,
          x2: parentRect.left + parentRect.width / 2 - rect.left,
          y2: parentRect.top + parentRect.height / 2 - rect.top,
        });
      });
      setDualLines(lines);
      setDualCanvas({ width: rect.width, height: rect.height });
    };
    update();
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dualConnections, zoom]);

  // Scroll selected card into view whenever selectedId changes
  useEffect(() => {
    if (!selectedId || !containerRef.current) return;
    const card = containerRef.current.querySelector(
      `[data-person-id="${selectedId}"]`,
    );
    if (card)
      card.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
  }, [selectedId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        setZoom((z) =>
          Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.001)),
        );
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomIn = () =>
    setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () =>
    setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(0.5);

  // Export
  const handleExport = useCallback(
    async (format) => {
      if (!treeRef.current) return;
      const { width: paperW, height: paperH } = PAPER_SIZES[exportSize];
      setExporting(true);
      setExportError("");
      const treeEl = treeRef.current;
      const savedZoom = treeEl.style.zoom;
      try {
        // Reset zoom to 1 so we capture at natural resolution
        treeEl.style.zoom = "1";
        // Wait for browser to reflow
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
          // Placeholder for cross-origin images that fail to load
          imagePlaceholder:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23e2e8f0'/%3E%3C/svg%3E",
        };

        let dataUrl;
        if (format === "png") {
          dataUrl = await toPng(treeEl, opts);
        } else {
          dataUrl = await toSvg(treeEl, opts);
        }
        downloadDataUrl(dataUrl, `silsilah-baniakhzab-${exportSize}.${format}`);
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Gagal ekspor.");
      } finally {
        treeEl.style.zoom = savedZoom;
        setExporting(false);
      }
    },
    [exportSize],
  );

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

  const currentPairLabel = React.useMemo(() => {
    if (!filterContext || !pairKey) return "Semua pasangan";
    const pair = filterContext.spousePairs.find((p) => p.key === pairKey);
    return pair ? pair.label : "Semua pasangan";
  }, [filterContext, pairKey]);

  const filteredPairs = React.useMemo(() => {
    if (!filterContext) return [];
    const term = pairSearchTerm.trim().toLowerCase();
    if (!term) return filterContext.spousePairs;
    return filterContext.spousePairs.filter((p) =>
      p.label.toLowerCase().includes(term),
    );
  }, [filterContext, pairSearchTerm]);

  const visibleIds = React.useMemo(() => {
    if (!filterContext) return null;
    const { persons, genById, childrenByParent } = filterContext;
    let baseVisible = null;

    if (pairKey) {
      const [a, b] = pairKey.split(":");
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

      if (direction === "down" || direction === "both") {
        focusIds.forEach((id) => visitDesc(id));
      }
      if (direction === "up" || direction === "both") {
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

    if (generationFilter !== "all") {
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

  const filteredRoots = React.useMemo(() => {
    if (!roots) return [];
    if (!visibleIds) return roots;

    const filterUnit = (unit) => {
      if (unit.isStub) {
        const visible = visibleIds.has(unit.stubPerson.id);
        return visible ? unit : null;
      }

      if (unit.isPolygamous) {
        const filteredMarriages = unit.marriages
          .map((m) => {
            const filteredChildren = (m.children || [])
              .map(filterUnit)
              .filter(Boolean);
            const wifeVisible = visibleIds.has(m.wife.id);
            if (!wifeVisible && filteredChildren.length === 0) return null;
            return { ...m, children: filteredChildren };
          })
          .filter(Boolean);

        const husbandVisible = unit.husband
          ? visibleIds.has(unit.husband.id)
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
        (unit.husband && visibleIds.has(unit.husband.id)) ||
        (unit.wife && visibleIds.has(unit.wife.id));

      if (!hasVisibleSelf && filteredChildren.length === 0) return null;

      return {
        ...unit,
        children: filteredChildren,
      };
    };

    return roots.map((r) => filterUnit(r)).filter(Boolean);
  }, [roots, visibleIds]);

  const filterStatusLabel = React.useMemo(() => {
    if (!filterContext) return "Semua anggota keluarga";
    const parts = [];
    if (pairKey) {
      const pair = filterContext.spousePairs.find((p) => p.key === pairKey);
      if (pair) parts.push(`Pasangan: ${pair.label}`);
    }
    if (direction && pairKey) {
      if (direction === "down") parts.push("Arah: Keturunan");
      else if (direction === "up") parts.push("Arah: Leluhur");
      else parts.push("Arah: Leluhur & keturunan");
    }
    if (generationFilter !== "all") {
      parts.push(`Generasi: G${generationFilter}`);
    }
    if (parts.length === 0) return "Semua anggota keluarga";
    return parts.join(" · ");
  }, [filterContext, pairKey, direction, generationFilter]);

  if (!filteredRoots || filteredRoots.length === 0) {
    return (
      <div className="state-box">
        <span>Tidak ada data silsilah ditemukan.</span>
      </div>
    );
  }

  return (
    <div className="ft-shell">
      {/* Toolbar */}
      <div className="ft-toolbar">
        <div className="chart-toolbar-group">
          <button
            type="button"
            className="ft-zoom-btn"
            onClick={zoomOut}
            title="Zoom out"
          >
            −
          </button>
          <span className="ft-zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="ft-zoom-btn"
            onClick={zoomIn}
            title="Zoom in"
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
        <div className="chart-toolbar-group">
          <label className="chart-toolbar-label" htmlFor="ft-export-size">
            Ukuran cetak
          </label>
          <select
            id="ft-export-size"
            className="chart-toolbar-select"
            value={exportSize}
            onChange={(e) => setExportSize(e.target.value)}
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="A2">A2</option>
          </select>
          <button
            type="button"
            className="chart-toolbar-button"
            onClick={() => handleExport("png")}
            disabled={exporting}
          >
            {exporting ? "Mengekspor…" : "Export PNG"}
          </button>
          <button
            type="button"
            className="chart-toolbar-button secondary"
            onClick={() => handleExport("svg")}
            disabled={exporting}
          >
            Export SVG
          </button>
        </div>
        {filterContext && (
          <div className="chart-toolbar-group">
            <label className="chart-toolbar-label" htmlFor="ft-filter-pair">
              Pasangan
            </label>
            <div className="ft-filter-pair">
              <button
                id="ft-filter-pair"
                type="button"
                className="chart-toolbar-select ft-filter-pair-display"
                onClick={() => setPairSearchOpen((v) => !v)}
              >
                <span>{currentPairLabel}</span>
                <span aria-hidden="true">▾</span>
              </button>
              {pairSearchOpen && (
                <div className="ft-filter-pair-popover">
                  <div className="search-panel">
                    <input
                      className="search-input"
                      type="text"
                      placeholder="Cari pasangan..."
                      value={pairSearchTerm}
                      onChange={(e) => setPairSearchTerm(e.target.value)}
                      autoFocus
                    />
                    <div className="search-results">
                      <button
                        type="button"
                        className="search-result"
                        onClick={() => {
                          setPairKey("");
                          setPairSearchTerm("");
                          setPairSearchOpen(false);
                        }}
                      >
                        Semua pasangan
                      </button>
                      {filteredPairs.map((pair) => (
                        <button
                          key={pair.key}
                          type="button"
                          className="search-result"
                          onClick={() => {
                            setPairKey(pair.key);
                            setPairSearchOpen(false);
                          }}
                        >
                          {pair.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <label
              className="chart-toolbar-label"
              htmlFor="ft-filter-direction"
            >
              Arah
            </label>
            <select
              id="ft-filter-direction"
              className="chart-toolbar-select"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="both">Leluhur & keturunan</option>
              <option value="down">Keturunan saja</option>
              <option value="up">Leluhur saja</option>
            </select>
            <label
              className="chart-toolbar-label"
              htmlFor="ft-filter-generation"
            >
              Generasi
            </label>
            <select
              id="ft-filter-generation"
              className="chart-toolbar-select"
              value={generationFilter}
              onChange={(e) => setGenerationFilter(e.target.value)}
            >
              <option value="all">Semua</option>
              {filterContext.generationOptions.map((g) => (
                <option key={g} value={g}>
                  G{g}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="chart-toolbar-group">
          <span className="chart-toolbar-label">{filterStatusLabel}</span>
          {(pairKey || generationFilter !== "all") && (
            <button
              type="button"
              className="chart-toolbar-button secondary"
              onClick={() => {
                setPairKey("");
                setGenerationFilter("all");
                setDirection("both");
              }}
            >
              Reset filter
            </button>
          )}
          {exportError && (
            <span className="chart-toolbar-error">{exportError}</span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="ft-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div ref={treeRef} className="ft-tree" style={{ zoom: zoom }}>
          {dualLines.length > 0 && (
            <svg
              className="ft-dual-svg"
              width={dualCanvas.width}
              height={dualCanvas.height}
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
          {filteredRoots.map((root) => (
            <FamilyUnit
              key={root.id}
              unit={root}
              highlightedIds={highlightedIds}
              onSelectPerson={onSelectPerson}
              depth={0}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

export default FamilyTree;
