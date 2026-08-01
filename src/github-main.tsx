import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ShopApp from "../app/ShopApp";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShopApp />
  </StrictMode>,
);
