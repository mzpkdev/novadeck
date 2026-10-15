// The response headers Cloudflare Pages serves the visitor build with, as its `_headers`
// file. Only the website may frame the demo: novadeck.dev, and its own deploys on
// Cloudflare Pages, previews included. The page asks search engines to stay away in its
// markup too, but a header covers every file. Files under assets/ carry their content's
// hash in their name, so a browser may keep them for good.
export const websiteOrigins = [
  "https://novadeck.dev",
  "https://novadeck-website.pages.dev",
  "https://*.novadeck-website.pages.dev",
]

export const tryHeaders = (): string =>
  [
    "/*",
    `  Content-Security-Policy: frame-ancestors 'self' ${websiteOrigins.join(" ")}`,
    "  X-Robots-Tag: noindex",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n")
