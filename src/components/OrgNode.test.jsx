import React from "react";
import { render, screen } from "@testing-library/react";
import OrgNode from "./OrgNode.jsx";

vi.mock("@xyflow/react", () => ({
  Handle: () => <div />,
  Position: { Top: "top", Bottom: "bottom" },
}));

const baseData = {
  label: "Siti Aminah",
  imgUrl: "",
  isMantu: false,
  isHighlighted: false
};

test("menampilkan label dan placeholder saat foto kosong", () => {
  render(<OrgNode data={baseData} />);

  expect(screen.getByText("Siti Aminah")).toBeInTheDocument();
  expect(screen.getByText("Siti Aminah").className).toContain("person-node-text");
});
