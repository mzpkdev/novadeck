import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@novadeck/css/tailwind.css"
import "@novadeck/css/recipes/button.css"
import "@novadeck/css/recipes/card.css"
import "@novadeck/css/recipes/field.css"
import "@novadeck/css/recipes/link.css"

import { App } from "./App"

const root = document.getElementById("root")

if (!root) throw new Error("Renderer root element is missing")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
