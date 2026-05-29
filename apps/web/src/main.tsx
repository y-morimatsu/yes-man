/**
 * main.tsx — entry point (NFR Design §1 + ultrathink FD I1).
 *
 * configureAuth() を起動時 1 回呼び、aws-amplify の Hub event を初期化.
 * test 環境では configureAuth は呼ばれない (副作用フリー).
 */
import { createRoot } from "react-dom/client";
import { configureAuth } from "./shell/auth";
import App from "./App";
import "./styles/main.css";

// 2026-05-27: 新 deploy で chunk hash が変わった後、古い index.html を保持した
// browser が存在しない chunk (例: DecisionPage-jJFhMdYc.js) を fetch して
// "Failed to fetch dynamically imported module" で落ちる事象の auto recovery.
// Vite 5+ は preload error 時に `vite:preloadError` event を発火する.
// session 内で 1 度だけ自動 reload して新 index.html を取得する (loop 防止).
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    const RELOAD_FLAG = "yesman:chunk-reload-attempted";
    if (sessionStorage.getItem(RELOAD_FLAG)) {
      // 既に 1 度 reload 試行済 → 通常 error として表示 (循環 reload 防止)
      console.warn("Chunk reload already attempted, surfacing error:", event);
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
    console.warn("Stale chunk detected, reloading page:", event);
    event.preventDefault();
    window.location.reload();
  });
  // 正常 navigation で次の session のため flag は clear
  window.addEventListener("load", () => {
    setTimeout(() => sessionStorage.removeItem("yesman:chunk-reload-attempted"), 5000);
  });
}

configureAuth();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(container).render(<App />);
