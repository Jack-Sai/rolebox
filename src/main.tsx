import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, useSettingsStore } from "./store/settings";

// 首帧就把主题写上去，避免启动时闪一下亮色。
applyTheme(useSettingsStore.getState().theme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
