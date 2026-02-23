import { describe, it, expect } from "vitest";
import { findRelationPaths } from "./buildFamilyTree.js";

function makePersons() {
  const persons = new Map();
  persons.set("1", {
    id: "1",
    name: "A",
    gender: "male",
    isMantu: false,
    generation: null,
    imgUrl: "",
    fatherId: null,
    motherId: null,
    spouseIds: ["2"],
  });
  persons.set("2", {
    id: "2",
    name: "B",
    gender: "female",
    isMantu: false,
    generation: null,
    imgUrl: "",
    fatherId: null,
    motherId: null,
    spouseIds: ["1"],
  });
  persons.set("3", {
    id: "3",
    name: "C",
    gender: "male",
    isMantu: false,
    generation: null,
    imgUrl: "",
    fatherId: "1",
    motherId: "2",
    spouseIds: [],
  });
  persons.set("4", {
    id: "4",
    name: "D",
    gender: "female",
    isMantu: false,
    generation: null,
    imgUrl: "",
    fatherId: "1",
    motherId: "2",
    spouseIds: [],
  });
  persons.set("5", {
    id: "5",
    name: "E",
    gender: "male",
    isMantu: false,
    generation: null,
    imgUrl: "",
    fatherId: "3",
    motherId: null,
    spouseIds: [],
  });
  return persons;
}

describe("findRelationPaths", () => {
  it("returns empty when ids invalid", () => {
    const persons = makePersons();
    const res = findRelationPaths(persons, null, "2", {
      parent: true,
      spouse: true,
    });
    expect(res.paths.length).toBe(0);
  });

  it("finds shortest path between spouses", () => {
    const persons = makePersons();
    const res = findRelationPaths(persons, "1", "2", {
      parent: true,
      spouse: true,
    });
    expect(res.shortestLength).toBe(1);
    expect(res.paths.length).toBe(1);
    expect(res.paths[0].nodes).toEqual(["1", "2"]);
    expect(res.paths[0].steps[0].kind).toBe("spouse");
  });

  it("finds parent child path", () => {
    const persons = makePersons();
    const res = findRelationPaths(persons, "1", "3", {
      parent: true,
      spouse: true,
    });
    expect(res.shortestLength).toBe(1);
    expect(res.paths[0].nodes).toEqual(["1", "3"]);
    expect(res.paths[0].steps[0].kind).toBe("parent");
  });

  it("finds grandparent path", () => {
    const persons = makePersons();
    const res = findRelationPaths(persons, "1", "5", {
      parent: true,
      spouse: true,
    });
    expect(res.shortestLength).toBe(2);
    expect(res.paths[0].nodes[0]).toBe("1");
    expect(res.paths[0].nodes[2]).toBe("5");
  });

  it("respects relation kind filters", () => {
    const persons = makePersons();
    const res = findRelationPaths(persons, "1", "2", {
      parent: true,
      spouse: false,
    });
    expect(res.paths.length).toBeGreaterThan(0);
    res.paths.forEach((p) => {
      p.steps.forEach((step) => {
        expect(step.kind).not.toBe("spouse");
      });
    });
  });
});
