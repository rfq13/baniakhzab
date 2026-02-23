import React, { memo } from "react";
import { LAYOUT } from "../utils/buildFamilyTree.js";

const DEFAULT_MALE_IMG = null;
const DEFAULT_FEMALE_IMG = null;

const PersonCard = memo(function PersonCard({
  person,
  highlighted,
  onClick,
  isRelationA,
  isRelationB,
}) {
  if (!person) return <div style={{ width: LAYOUT.CARD_W }} />;

  const { name, gender, imgUrl, isMantu } = person;
  const isReal = imgUrl && !imgUrl.includes("noimg");

  const genderClass =
    gender === "male" ? "pc-male" : gender === "female" ? "pc-female" : "";
  const relationClass = isRelationA
    ? "pc-relation-a"
    : isRelationB
      ? "pc-relation-b"
      : "";

  return (
    <div
      data-person-id={person.id}
      className={`person-card ${genderClass} ${isMantu ? "pc-mantu" : ""} ${highlighted ? "pc-highlighted" : ""} ${relationClass}`}
      style={{ width: LAYOUT.CARD_W }}
      onClick={onClick}
      title={name}
    >
      <div className="pc-avatar">
        {isReal ? (
          <img src={imgUrl} alt={name} loading="lazy" />
        ) : (
          <span className={`pc-avatar-icon ${gender === "female" ? "pc-avatar-female" : "pc-avatar-male"}`} />
        )}
      </div>
      <div className="pc-name">{name}</div>
    </div>
  );
});

export default PersonCard;
