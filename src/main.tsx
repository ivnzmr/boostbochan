import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./features/overlay/OverlayApp";
import "./index.css";

// The in-game overlay window loads the same bundle with "#overlay".
const isOverlay = window.location.hash === "#overlay";
if (isOverlay) document.documentElement.classList.add("overlay");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <OverlayApp /> : <App />}</React.StrictMode>,
);
