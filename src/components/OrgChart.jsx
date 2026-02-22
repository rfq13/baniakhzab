import React, { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useNodes,
  getViewportForBounds,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import PersonNode from "./OrgNode.jsx";

const nodeTypes = { person: PersonNode };

const PAPER_SIZES = {
  A4: { width: 3508, height: 2480 },
  A3: { width: 4961, height: 3508 },
  A2: { width: 7016, height: 4961 },
};

const downloadDataUrl = (dataUrl, filename) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
};

const FlowCanvas = ({ graph, highlightedIds, selectedId, onSelectNode, exportSize, onExportSizeChange, onExportError }) => {
  const { nodes: graphNodes, edges } = graph;
  const flow = useReactFlow();
  const liveNodes = useNodes();

  const enrichedNodes = useMemo(
    () =>
      graphNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isHighlighted: highlightedIds.has(node.id),
        },
      })),
    [graphNodes, highlightedIds],
  );

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const target = graphNodes.find((node) => node.id === selectedId);
    if (target) {
      flow.setCenter(target.position.x, target.position.y, { zoom: 1.2 });
    }
  }, [selectedId, graphNodes, flow]);

  const getViewport = () => {
    const { width, height } = PAPER_SIZES[exportSize] || PAPER_SIZES.A3;
    const bounds = flow.getNodesBounds(liveNodes);
    return { width, height, viewport: getViewportForBounds(bounds, width, height, 0.05, 4, 0.08) };
  };

  const handleExportPng = async () => {
    const viewportEl = document.querySelector(".react-flow__viewport");
    if (!viewportEl) {
      onExportError("Area ekspor tidak ditemukan.");
      return;
    }
    try {
      onExportError("");
      const { width, height, viewport } = getViewport();
      const dataUrl = await toPng(viewportEl, {
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "top left",
        },
      });
      downloadDataUrl(dataUrl, `silsilah-baniakhzab-${exportSize}.png`);
    } catch (err) {
      onExportError(err instanceof Error ? err.message : "Gagal ekspor PNG.");
    }
  };

  const handleExportSvg = async () => {
    const viewportEl = document.querySelector(".react-flow__viewport");
    if (!viewportEl) {
      onExportError("Area ekspor tidak ditemukan.");
      return;
    }
    try {
      onExportError("");
      const { width, height, viewport } = getViewport();
      const dataUrl = await toSvg(viewportEl, {
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "top left",
        },
      });
      downloadDataUrl(dataUrl, `silsilah-baniakhzab-${exportSize}.svg`);
    } catch (err) {
      onExportError(err instanceof Error ? err.message : "Gagal ekspor SVG.");
    }
  };

  return (
    <>
      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => onSelectNode(node.id)}
      >
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
        <Background gap={20} size={1} />
      </ReactFlow>
      <div className="chart-export-bar">
        <div className="chart-toolbar-group">
          <label className="chart-toolbar-label" htmlFor="export-size">
            Ukuran cetak
          </label>
          <select
            id="export-size"
            className="chart-toolbar-select"
            value={exportSize}
            onChange={(e) => onExportSizeChange(e.target.value)}
          >
            <option value="A4">A4 (297×210mm)</option>
            <option value="A3">A3 (420×297mm)</option>
            <option value="A2">A2 (594×420mm)</option>
          </select>
        </div>
        <div className="chart-toolbar-group">
          <button
            type="button"
            className="chart-toolbar-button"
            onClick={handleExportPng}
          >
            Export PNG
          </button>
          <button
            type="button"
            className="chart-toolbar-button secondary"
            onClick={handleExportSvg}
          >
            Export SVG
          </button>
        </div>
      </div>
    </>
  );
};

export default function OrgChart({
  graph,
  highlightedIds,
  selectedId,
  onSelectNode,
}) {
  const [exportSize, setExportSize] = useState("A3");
  const [exportError, setExportError] = useState("");

  return (
    <div className="chart-wrapper">
      {exportError && (
        <div className="chart-export-error">
          <span className="chart-toolbar-error">{exportError}</span>
        </div>
      )}
      <ReactFlowProvider>
        <FlowCanvas
          graph={graph}
          highlightedIds={highlightedIds}
          selectedId={selectedId}
          onSelectNode={onSelectNode}
          exportSize={exportSize}
          onExportSizeChange={setExportSize}
          onExportError={setExportError}
        />
      </ReactFlowProvider>
    </div>
  );
}
