/** Hash navigation is local UI state; the document receiving credentials stays fixed. */
export const isTrustedDocument = (actual: string, expected: string): boolean => {
  try {
    const document = new URL(actual)
    const trusted = new URL(expected)
    document.hash = ""
    trusted.hash = ""
    return document.href === trusted.href
  } catch {
    return false
  }
}

export const isTrustedFrame = (
  frame: Readonly<{ url: string }> | null,
  mainFrame: Readonly<{ url: string }>,
  expected: string,
): boolean => frame === mainFrame && isTrustedDocument(frame.url, expected)
