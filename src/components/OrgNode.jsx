import React from "react";
import { Handle, Position } from "@xyflow/react";

export default function PersonNode({ data }) {
  const hasImage = Boolean(data.imgUrl);
  const genderClass = data.gender === "male" || data.gender === "female" ? data.gender : "";
  return (
    <div
      className={`person-node ${genderClass} ${data.isHighlighted ? "highlighted" : ""} ${
        data.isMantu ? "mantu" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="person-node-content">
        <div className="person-node-avatar">
          {hasImage ? (
            <img src={data.imgUrl} alt={data.label} />
          ) : (
            <span className="person-node-placeholder" />
          )}
        </div>
        <div className="person-node-text">{data.label}</div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
