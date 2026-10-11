import React from "react";
import { createRoot } from "react-dom/client";
import { Warehouse } from "../warehouse/Warehouse";
const root = document.getElementById("retail");
if (root)
  createRoot(root).render(
    <Warehouse retail language={document.documentElement.lang || "en"} />,
  );
