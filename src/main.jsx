import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import "./styles.css";

/**
 * Simple path-based routing without react-router-dom.
 * /       → public landing page (no auth)
 * /tree   → main app (requires auth)
 */
const isTree = window.location.pathname.startsWith("/tree");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isTree ? <App /> : <Landing />}
  </React.StrictMode>
);
