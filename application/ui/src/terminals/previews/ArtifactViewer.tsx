import { ArrowLeft, FileCode2, Globe, Image, RotateCw } from "lucide-react"
import { useState } from "react"

import { sampleFile, type ArtifactKind, type Shown } from "./artifacts"

export const kindIcons: Record<ArtifactKind, typeof Image> = {
  image: Image,
  file: FileCode2,
  page: Globe,
}

// Mocked viewers for what an agent shows beside its terminal. Real ones would render the
// image, highlight the file and host the page; the design study only needs their frames.

const ivory = "#f6f1e7"
const ink = "#2d2a24"
const olive = "#7d8454"
const clay = "#c4704f"
const sand = "#b9ae8e"
const serif = "Georgia, serif"

// The sample images: drafts of the Studio site, in its own palette.
const drawings: Record<string, React.JSX.Element> = {
  hero: (
    <>
      <rect width="800" height="450" fill={ivory} />
      <rect x="470" y="60" width="270" height="330" rx="6" fill={olive} />
      <circle cx="605" cy="190" r="70" fill={clay} />
      <rect x="470" y="300" width="270" height="90" fill="#6b7148" />
      <text x="60" y="120" fontFamily={serif} fontSize="22" fill={olive}>
        Studio
      </text>
      <text x="60" y="200" fontFamily={serif} fontSize="46" fill={ink}>
        Careful work,
      </text>
      <text x="60" y="254" fontFamily={serif} fontSize="46" fill={ink}>
        made slowly.
      </text>
      <rect x="60" y="300" width="130" height="36" rx="18" fill={ink} />
      <text x="92" y="323" fontFamily="Arial, sans-serif" fontSize="14" fill={ivory}>
        See the work
      </text>
    </>
  ),
  about: (
    <>
      <rect width="800" height="450" fill={ivory} />
      <rect x="60" y="60" width="300" height="330" rx="4" fill={clay} />
      <circle cx="210" cy="190" r="60" fill={sand} />
      <text x="420" y="130" fontFamily={serif} fontSize="40" fill={ink}>
        About Studio
      </text>
      <rect x="420" y="170" width="300" height="10" rx="5" fill={sand} />
      <rect x="420" y="195" width="270" height="10" rx="5" fill={sand} />
      <rect x="420" y="220" width="290" height="10" rx="5" fill={sand} />
      <rect x="420" y="280" width="140" height="36" rx="18" fill={ink} />
    </>
  ),
  mobile: (
    <>
      <rect width="800" height="450" fill="#e9e4d8" />
      <rect
        x="310"
        y="20"
        width="180"
        height="410"
        rx="22"
        fill={ivory}
        stroke={ink}
        strokeWidth="4"
      />
      <text x="332" y="90" fontFamily={serif} fontSize="20" fill={ink}>
        Careful work,
      </text>
      <text x="332" y="114" fontFamily={serif} fontSize="20" fill={ink}>
        made slowly.
      </text>
      <rect x="332" y="140" width="136" height="90" rx="3" fill={olive} />
      <rect x="332" y="240" width="136" height="90" rx="3" fill={clay} />
      <rect x="332" y="340" width="136" height="60" rx="3" fill={sand} />
    </>
  ),
}

// An image the agent showed, mocked. Unlabelled, it's decoration beside its name.
export const ImageArt = ({ id, label }: { id: string; label?: string }): React.JSX.Element => (
  <svg
    viewBox="0 0 800 450"
    {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
  >
    {drawings[id] ?? drawings["hero"]}
  </svg>
)

const ImageViewer = ({ artifact }: { artifact: Shown }): React.JSX.Element => {
  const [actual, setActual] = useState(false)
  return (
    <>
      <div className="artifact-meta">
        <code>{artifact.name}</code>
        <span>{artifact.detail}</span>
        <span className="artifact-meta-push" />
        <div className="artifact-zoom" role="group" aria-label="Zoom">
          <button aria-pressed={!actual} onClick={() => setActual(false)}>
            Fit
          </button>
          <button aria-pressed={actual} onClick={() => setActual(true)}>
            100%
          </button>
        </div>
      </div>
      <div className="artifact-image" data-actual={actual}>
        <ImageArt id={artifact.id} label={artifact.name} />
      </div>
    </>
  )
}

const FileViewer = (): React.JSX.Element => (
  <>
    <div className="artifact-meta">
      <code>{sampleFile.path}</code>
      <span>
        lines {sampleFile.from}–{sampleFile.to} · read-only
      </span>
    </div>
    <div className="artifact-code" role="region" aria-label={sampleFile.path} tabIndex={0}>
      {sampleFile.lines.map((line, index) => {
        const number = sampleFile.firstLine + index
        return (
          <div key={number} data-pointed={number >= sampleFile.from && number <= sampleFile.to}>
            <span aria-hidden="true">{number}</span>
            <span>{line}</span>
          </div>
        )
      })}
    </div>
  </>
)

const PageViewer = ({ artifact }: { artifact: Shown }): React.JSX.Element => (
  <div className="artifact-browser">
    <div className="artifact-browser-bar">
      <button aria-label="Back">
        <ArrowLeft size={13} />
      </button>
      <button aria-label="Reload">
        <RotateCw size={13} />
      </button>
      <span className="artifact-url">http://{artifact.name}/</span>
    </div>
    <div className="artifact-site">
      <nav>
        <b>Studio</b>
        <span>Work</span>
        <span>About</span>
      </nav>
      <h2>Careful work, made slowly.</h2>
      <p>An independent design practice working on identities, publications and places.</p>
      <div className="artifact-site-work">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
)

// A small picture of an artifact, for a peek: the image itself, the lines the agent
// pointed at, or the page in a browser frame.
export const ArtifactThumb = ({ artifact }: { artifact: Shown }): React.JSX.Element =>
  artifact.kind === "image" ? (
    <ImageArt id={artifact.id} />
  ) : artifact.kind === "file" ? (
    <code className="peek-code">
      {sampleFile.lines.slice(sampleFile.from - sampleFile.firstLine).join("\n")}
    </code>
  ) : (
    <span className="peek-site">
      <span className="peek-site-bar">
        <i />
        <i />
        <i />
      </span>
      <b>Careful work, made slowly.</b>
      <span className="peek-site-work">
        <i />
        <i />
        <i />
      </span>
    </span>
  )

export const ArtifactViewer = ({ artifact }: { artifact: Shown }): React.JSX.Element => (
  <div className="artifact-viewer">
    {artifact.kind === "image" ? (
      <ImageViewer artifact={artifact} />
    ) : artifact.kind === "file" ? (
      <FileViewer />
    ) : (
      <PageViewer artifact={artifact} />
    )}
  </div>
)
