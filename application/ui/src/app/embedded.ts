import { createContext, useContext } from "react"

// Whether the app runs framed in another page, as the website's hero frames the visitor
// build: the page around it says what it is and decides what a phone gets, so the app shows
// neither the visitor strip nor the narrow window's panel.
export const EmbeddedContext = createContext(false)

export const useEmbedded = (): boolean => useContext(EmbeddedContext)
