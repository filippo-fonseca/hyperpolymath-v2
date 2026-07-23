// Minimal icon set for the phone editor accessory bar + block picker.
// Bundled into the `'use dom'` web bundle (SVG / styled glyphs, currentColor),
// so it stays dependency-free and matches the sd register.

import type { JSX } from "react";

export type IconName =
  | "plus"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "bullet"
  | "numbered"
  | "check"
  | "outdent"
  | "indent"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "code"
  | "table";

function Svg({ children }: { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A typographic glyph (B, I, H1, …) rendered as text rather than paths. */
function Glyph({ label, italic, underline, strike }: {
  label: string;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}) {
  return (
    <span
      className="wiki-glyph"
      style={{
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : strike ? "line-through" : "none",
      }}
    >
      {label}
    </span>
  );
}

export function Icon({ name }: { name: IconName }): JSX.Element {
  switch (name) {
    case "plus":
      return (
        <Svg>
          <path d="M10 4v12M4 10h12" />
        </Svg>
      );
    case "bold":
      return <Glyph label="B" />;
    case "italic":
      return <Glyph label="I" italic />;
    case "underline":
      return <Glyph label="U" underline />;
    case "strike":
      return <Glyph label="S" strike />;
    case "text":
      return <Glyph label="T" />;
    case "h1":
      return <Glyph label="H1" />;
    case "h2":
      return <Glyph label="H2" />;
    case "h3":
      return <Glyph label="H3" />;
    case "quote":
      return (
        <Svg>
          <path d="M5 15V9a3 3 0 0 1 3-3M12 15V9a3 3 0 0 1 3-3" />
        </Svg>
      );
    case "bullet":
      return (
        <Svg>
          <path d="M7 6h9M7 10h9M7 14h9" />
          <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="10" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="14" r="1" fill="currentColor" stroke="none" />
        </Svg>
      );
    case "numbered":
      return (
        <Svg>
          <path d="M8 6h9M8 10h9M8 14h9" />
          <path d="M3 5v3M2.5 8h1M2.5 11.5h1.2l-1.2 1.5h1.2" strokeWidth="1.2" />
        </Svg>
      );
    case "check":
      return (
        <Svg>
          <rect x="3" y="4" width="6" height="6" rx="1.5" />
          <path d="M4.5 7l1.3 1.3L8 5.7" strokeWidth="1.3" />
          <path d="M12 7h5M12 14h5" />
          <rect x="3" y="12" width="6" height="6" rx="1.5" />
        </Svg>
      );
    case "outdent":
      return (
        <Svg>
          <path d="M16 5H4M16 10H8M16 15H4M7 8l-3 2 3 2" />
        </Svg>
      );
    case "indent":
      return (
        <Svg>
          <path d="M4 5h12M8 10h8M4 15h12M4 8l3 2-3 2" />
        </Svg>
      );
    case "image":
      return (
        <Svg>
          <rect x="3" y="4" width="14" height="12" rx="2" />
          <circle cx="7.5" cy="8.5" r="1.3" />
          <path d="M4 14l4-4 3 3 2-2 3 3" />
        </Svg>
      );
    case "video":
      return (
        <Svg>
          <rect x="3" y="5" width="10" height="10" rx="2" />
          <path d="M13 9l4-2v6l-4-2" />
        </Svg>
      );
    case "audio":
      return (
        <Svg>
          <path d="M5 8v4M8 5v10M11 7v6M14 9v2" />
        </Svg>
      );
    case "file":
      return (
        <Svg>
          <path d="M6 3h5l4 4v10H6z" />
          <path d="M11 3v4h4" />
        </Svg>
      );
    case "code":
      return (
        <Svg>
          <path d="M7 7l-3 3 3 3M13 7l3 3-3 3" />
        </Svg>
      );
    case "table":
      return (
        <Svg>
          <rect x="3" y="4" width="14" height="12" rx="1.5" />
          <path d="M3 8h14M3 12h14M8 4v12" />
        </Svg>
      );
    default:
      return <Glyph label="?" />;
  }
}
