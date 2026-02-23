import React, { memo, useMemo } from "react";
import PersonCard from "./PersonCard.jsx";
import {
  LAYOUT,
  marriageGroupWidth,
  polygamyWivesWidth,
  subtreeWidth,
} from "../utils/buildFamilyTree.js";

// ── Connector SVG ─────────────────────────────────────────────────────────────
// Draws the lines from the couple's midpoint down to each child's midpoint.
// All positions are pre-calculated from fixed layout constants — no DOM measurement.
const ConnectorSVG = memo(function ConnectorSVG({ unit, totalW }) {
  const children = unit.children;
  if (!children.length) return null;

  // Couple midpoint X within totalW container
  const coupleMidX = Math.round(totalW / 2);

  // Calculate cumulative X offsets for each child subtree
  const childOffsets = [];
  let cursor = 0;
  // If totalW > children sum, children row is centered — compute offset
  const childrenRowW =
    children.reduce((s, c) => s + subtreeWidth(c), 0) +
    LAYOUT.CHILD_GAP * (children.length - 1);
  const rowStartX = Math.round((totalW - childrenRowW) / 2);

  for (const child of children) {
    const sw = subtreeWidth(child);
    const childMidX = rowStartX + cursor + Math.round(sw / 2);
    childOffsets.push(childMidX);
    cursor += sw + LAYOUT.CHILD_GAP;
  }

  const svgH = LAYOUT.GEN_GAP;
  const midY = Math.round(svgH / 2);
  const stroke = "#94a3b8";
  const sw = 2;

  // Vertical drop from couple center to horizontal bar
  // Then horizontal bar from first child mid to last child mid
  // Then drops from bar to each child top
  const firstX = childOffsets[0];
  const lastX = childOffsets[childOffsets.length - 1];

  const paths = [];

  // vertical drop from couple
  paths.push(
    <line
      key="drop"
      x1={coupleMidX}
      y1={0}
      x2={coupleMidX}
      y2={midY}
      stroke={stroke}
      strokeWidth={sw}
    />,
  );

  if (children.length === 1) {
    // straight line to single child
    paths.push(
      <line
        key="to-child"
        x1={coupleMidX}
        y1={midY}
        x2={childOffsets[0]}
        y2={midY}
        stroke={stroke}
        strokeWidth={sw}
      />,
    );
  } else {
    // horizontal bar
    paths.push(
      <line
        key="hbar"
        x1={firstX}
        y1={midY}
        x2={lastX}
        y2={midY}
        stroke={stroke}
        strokeWidth={sw}
      />,
    );
  }

  // drops to each child
  childOffsets.forEach((cx, i) => {
    paths.push(
      <line
        key={`cd-${i}`}
        x1={cx}
        y1={midY}
        x2={cx}
        y2={svgH}
        stroke={stroke}
        strokeWidth={sw}
      />,
    );
  });

  return (
    <svg
      width={totalW}
      height={svgH}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
});

// ── Marriage Bar SVG ──────────────────────────────────────────────────────────
const MarriageBarSVG = memo(function MarriageBarSVG({ hasChildren }) {
  const w = LAYOUT.COUPLE_GAP;
  const cy = Math.round(LAYOUT.CARD_H / 2);
  return (
    <svg
      width={w}
      height={LAYOUT.CARD_H}
      style={{ flexShrink: 0, display: "block" }}
      aria-hidden="true"
    >
      <line x1={0} y1={cy} x2={w} y2={cy} stroke="#94a3b8" strokeWidth={2} />
      <circle cx={Math.round(w / 2)} cy={cy} r={3} fill="#94a3b8" />
      {hasChildren && (
        <line
          x1={Math.round(w / 2)}
          y1={cy}
          x2={Math.round(w / 2)}
          y2={LAYOUT.CARD_H}
          stroke="#94a3b8"
          strokeWidth={2}
        />
      )}
    </svg>
  );
});

// Small stem SVG for single-person units with children
const SingleStemSVG = memo(function SingleStemSVG({ totalW }) {
  const cx = Math.round(totalW / 2);
  return (
    <svg
      width={totalW}
      height={Math.round(LAYOUT.CARD_H / 2)}
      style={{
        display: "block",
        flexShrink: 0,
        marginTop: `-${Math.round(LAYOUT.CARD_H / 2)}px`,
      }}
      aria-hidden="true"
    >
      <line
        x1={cx}
        y1={0}
        x2={cx}
        y2={Math.round(LAYOUT.CARD_H / 2)}
        stroke="#94a3b8"
        strokeWidth={2}
      />
    </svg>
  );
});

const PolygamyConnectorSVG = memo(function PolygamyConnectorSVG({
  unit,
  totalW,
  wivesRowW,
  marriageWidths,
}) {
  if (!unit.marriages || unit.marriages.length === 0) return null;
  const svgH = LAYOUT.POLYGAMY_GAP;
  const midY = Math.round(svgH / 2);
  const stroke = "#94a3b8";
  const sw = 2;
  const rowStartX = Math.round((totalW - wivesRowW) / 2);

  const wifeCenters = [];
  let cursor = 0;
  unit.marriages.forEach((marriage, idx) => {
    const groupW = marriageWidths[idx] || LAYOUT.CARD_W;
    const wifeMidX = rowStartX + cursor + Math.round(groupW / 2);
    wifeCenters.push(wifeMidX);
    cursor += groupW + LAYOUT.POLYGAMY_WIFE_GAP;
  });

  const husbandMidX = Math.round(totalW / 2);
  const firstX = wifeCenters[0];
  const lastX = wifeCenters[wifeCenters.length - 1];

  const paths = [];
  paths.push(
    <line
      key="drop"
      x1={husbandMidX}
      y1={0}
      x2={husbandMidX}
      y2={midY}
      stroke={stroke}
      strokeWidth={sw}
    />,
  );

  if (wifeCenters.length === 1) {
    paths.push(
      <line
        key="to-wife"
        x1={husbandMidX}
        y1={midY}
        x2={wifeCenters[0]}
        y2={midY}
        stroke={stroke}
        strokeWidth={sw}
      />,
    );
  } else {
    paths.push(
      <line
        key="hbar"
        x1={firstX}
        y1={midY}
        x2={lastX}
        y2={midY}
        stroke={stroke}
        strokeWidth={sw}
      />,
    );
  }

  wifeCenters.forEach((cx, i) => {
    paths.push(
      <line
        key={`wd-${i}`}
        x1={cx}
        y1={midY}
        x2={cx}
        y2={svgH}
        stroke={stroke}
        strokeWidth={sw}
      />,
    );
  });

  return (
    <svg
      width={totalW}
      height={svgH}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
});

// ── Stub Unit Indicator SVG ───────────────────────────────────────────────────
const StubIndicatorSVG = memo(function StubIndicatorSVG() {
  return (
    <svg
      width={20}
      height={16}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      <line
        x1="10"
        y1="0"
        x2="10"
        y2="8"
        stroke="#94a3b8"
        strokeWidth={2}
        strokeDasharray="3,2"
      />
      <polygon points="6,8 14,8 10,14" fill="#94a3b8" />
    </svg>
  );
});

// ── FamilyUnit ────────────────────────────────────────────────────────────────
const FamilyUnit = memo(function FamilyUnit({
  unit,
  highlightedIds,
  onSelectPerson,
  depth,
  relationAId,
  relationBId,
}) {
  const totalW = useMemo(() => subtreeWidth(unit), [unit]);
  const isPolygamous = Boolean(unit.isPolygamous);
  const isStub = Boolean(unit.isStub);
  const hasH = Boolean(unit.husband);
  const hasW = Boolean(unit.wife);
  const hasChildren = unit.children.length > 0;
  const wivesRowW = useMemo(
    () => (isPolygamous ? polygamyWivesWidth(unit) : 0),
    [unit, isPolygamous],
  );
  const marriageWidths = useMemo(
    () =>
      isPolygamous ? unit.marriages.map((m) => marriageGroupWidth(m)) : [],
    [unit, isPolygamous],
  );

  // KASUS STUB: Anak non-mantu yang menikah, tampilkan dengan indikator
  if (isStub) {
    return (
      <div
        data-unit-id={unit.id}
        className="fu-wrapper fu-stub"
        style={{
          width: LAYOUT.CARD_W,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <PersonCard
          person={unit.stubPerson}
          highlighted={highlightedIds?.has(unit.stubPerson.id)}
          isRelationA={relationAId === unit.stubPerson.id}
          isRelationB={relationBId === unit.stubPerson.id}
          onClick={() => onSelectPerson?.(unit.stubPerson.id)}
        />
        <StubIndicatorSVG />
      </div>
    );
  }

  if (isPolygamous) {
    return (
      <div
        data-unit-id={unit.id}
        className="fu-wrapper"
        style={{
          width: totalW,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          data-unit-couple="true"
          className="fu-couple"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {hasH && (
            <PersonCard
              person={unit.husband}
              highlighted={highlightedIds?.has(unit.husband.id)}
              isRelationA={relationAId === unit.husband.id}
              isRelationB={relationBId === unit.husband.id}
              onClick={() => onSelectPerson?.(unit.husband.id)}
            />
          )}
        </div>
        <PolygamyConnectorSVG
          unit={unit}
          totalW={totalW}
          wivesRowW={wivesRowW}
          marriageWidths={marriageWidths}
        />
        <div
          className="fu-children"
          style={{
            width: wivesRowW,
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: LAYOUT.POLYGAMY_WIFE_GAP,
          }}
        >
          {unit.marriages.map((marriage, idx) => {
            const groupW = marriageWidths[idx] || LAYOUT.CARD_W;
            const wifeId = marriage.wife?.id || `wife-${idx}`;
            return (
              <div
                key={`${unit.id}-${wifeId}`}
                style={{
                  width: groupW,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <PersonCard
                  person={marriage.wife}
                  highlighted={highlightedIds?.has(marriage.wife?.id)}
                  isRelationA={relationAId === marriage.wife?.id}
                  isRelationB={relationBId === marriage.wife?.id}
                  onClick={() => onSelectPerson?.(marriage.wife?.id)}
                />
                {marriage.children.length > 0 && (
                  <>
                    <SingleStemSVG totalW={groupW} />
                    <ConnectorSVG
                      unit={{ children: marriage.children }}
                      totalW={groupW}
                    />
                    <div
                      className="fu-children"
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: LAYOUT.CHILD_GAP,
                      }}
                    >
                      {marriage.children.map((child) => (
                        <FamilyUnit
                          key={child.id}
                          unit={child}
                          highlightedIds={highlightedIds}
                          onSelectPerson={onSelectPerson}
                          depth={depth + 1}
                          relationAId={relationAId}
                          relationBId={relationBId}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      data-unit-id={unit.id}
      className="fu-wrapper"
      style={{
        width: totalW,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Couple row */}
      <div
        data-unit-couple="true"
        className="fu-couple"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasH && (
          <PersonCard
            person={unit.husband}
            highlighted={highlightedIds?.has(unit.husband.id)}
            isRelationA={relationAId === unit.husband.id}
            isRelationB={relationBId === unit.husband.id}
            onClick={() => onSelectPerson?.(unit.husband.id)}
          />
        )}
        {hasH && hasW && <MarriageBarSVG hasChildren={hasChildren} />}
        {hasW && (
          <PersonCard
            person={unit.wife}
            highlighted={highlightedIds?.has(unit.wife.id)}
            isRelationA={relationAId === unit.wife.id}
            isRelationB={relationBId === unit.wife.id}
            onClick={() => onSelectPerson?.(unit.wife.id)}
          />
        )}
      </div>

      {/* Connector + Children */}
      {hasChildren && (
        <>
          {!(hasH && hasW) && <SingleStemSVG totalW={totalW} />}
          <ConnectorSVG unit={unit} totalW={totalW} />
          <div
            className="fu-children"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: LAYOUT.CHILD_GAP,
            }}
          >
            {unit.children.map((child, i) => (
              <FamilyUnit
                key={child.id}
                unit={child}
                highlightedIds={highlightedIds}
                onSelectPerson={onSelectPerson}
                depth={depth + 1}
                relationAId={relationAId}
                relationBId={relationBId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
});

export default FamilyUnit;
