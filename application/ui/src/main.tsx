import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@fontsource-variable/geist/wght.css"
import "@fontsource-variable/geist-mono/wght.css"
import "tailwindcss/index.css"

import { App } from "./App"

const root = document.getElementById("root")

if (!root) throw new Error("Renderer root element is missing")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
