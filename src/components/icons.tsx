// Monochrome SVG icons for toolbar (single-color, no text)
// All icons are 20x20 viewBox, designed to be uniform

import type { JSX } from "react";

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconCopy = (): JSX.Element => (
  <svg {...iconProps}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const IconSave = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

export const IconCancel = (): JSX.Element => (
  <svg {...iconProps}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconUndo = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
  </svg>
);

export const IconRedo = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
  </svg>
);

export const IconTrash = (): JSX.Element => (
  <svg {...iconProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

export const IconPen = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

export const IconLine = (): JSX.Element => (
  <svg {...iconProps}>
    <line x1="5" y1="19" x2="19" y2="5" />
  </svg>
);

export const IconArrow = (): JSX.Element => (
  <svg {...iconProps}>
    <line x1="5" y1="19" x2="19" y2="5" />
    <polyline points="9 5 19 5 19 15" />
  </svg>
);

export const IconRect = (): JSX.Element => (
  <svg {...iconProps}>
    <rect x="4" y="6" width="16" height="12" rx="1" />
  </svg>
);

export const IconEllipse = (): JSX.Element => (
  <svg {...iconProps}>
    <ellipse cx="12" cy="12" rx="9" ry="6" />
  </svg>
);

export const IconHighlight = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M9 11l-6 6v3h9l3-3" />
    <path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0L11 13l4-4 3.6 3.6a2 2 0 0 0 2.8 0L22 12z" />
  </svg>
);

export const IconBlur = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M12 3a9 9 0 1 1-6.36 2.64" />
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M5.64 5.64l2.83 2.83M15.53 15.53l2.83 2.83M18.36 5.64l-2.83 2.83M8.47 15.53l-2.83 2.83" />
  </svg>
);

export const IconText = (): JSX.Element => (
  <svg {...iconProps}>
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
);

// New: drag/move tool
export const IconMove = (): JSX.Element => (
  <svg {...iconProps}>
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

// Hand cursor for editing existing annotations
export const IconResize = (): JSX.Element => (
  <svg {...iconProps}>
    <path d="M7 11V5a1.5 1.5 0 0 1 3 0v5" />
    <path d="M10 10V3.5a1.5 1.5 0 0 1 3 0V10" />
    <path d="M13 10V5a1.5 1.5 0 0 1 3 0v6" />
    <path d="M16 11V8.5a1.5 1.5 0 0 1 3 0v5.2c0 4.6-2.8 7.3-6.8 7.3h-1.1c-2.1 0-3.2-.8-4.4-2.4L3.2 14a1.5 1.5 0 0 1 2.4-1.8L7 14V11" />
  </svg>
);
