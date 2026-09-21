import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@novadeck/css/tailwind.css"
import "@novadeck/css/tailwind/editable.css"
import "@novadeck/css/tailwind/field.css"
import "@novadeck/css/tailwind/tabs.css"

import { App } from "./App"

const root = document.getElementById("root")

if (!root) throw new Error("Renderer root element is missing")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
