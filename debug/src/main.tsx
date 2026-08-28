import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import "./styles.css";

const storedTheme = (() => {
  try {
    return localStorage.getItem("lumi-assistant-theme") ?? localStorage.getItem("boop-debug-theme");
  } catch {
    return null;
  }
})();
document.documentElement.classList.add(storedTheme === "light" ? "light" : "dark");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
