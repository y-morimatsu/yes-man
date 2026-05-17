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

configureAuth();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(container).render(<App />);
