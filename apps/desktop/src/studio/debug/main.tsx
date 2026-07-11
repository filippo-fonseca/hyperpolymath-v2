// TEMP: replaced by desktop-react-shell at merge.
// Bare Vite mount used to exercise summon, drag, resize, focus, pin, and close.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { STUDIO_COLORS } from "../tokens";
import { WidgetWindowLayer } from "../windows/WidgetWindowLayer";

document.documentElement.style.height = "100%";
document.body.style.cssText = `
  height: 100%;
  margin: 0;
  overflow: hidden;
  color: ${STUDIO_COLORS.text};
  background: radial-gradient(circle at top, ${STUDIO_COLORS.surface}, ${STUDIO_COLORS.background} 70%);
  font-family: system-ui, sans-serif;
  user-select: none;
`;

const root = document.getElementById("root");
if (!root) throw new Error("Missing studio debug root");
root.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden";

createRoot(root).render(
  <StrictMode>
    <WidgetWindowLayer debugSummon />
  </StrictMode>,
);
