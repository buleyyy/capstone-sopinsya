type P = { size?: number; className?: string };

function svgProps(size: number, className?: string) {
  return { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false, className } as const;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function CalendarIcon({ size = 18, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

export function PinIcon({ size = 18, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

export function UserIcon({ size = 18, className }: P) {
  return (
    <svg {...svgProps(size, className)} fill="currentColor">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
    </svg>
  );
}

export function SearchIcon({ size = 20, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

export function ChevronIcon({ size = 18, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CloseIcon({ size = 22, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function PlayIcon({ size = 44, className }: P) {
  return (
    <svg {...svgProps(size, className)} fill="currentColor">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

export function CommentIcon({ size = 24, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M7 9h10M7 12.5h6" />
    </svg>
  );
}

export function DownloadIcon({ size = 20, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
    </svg>
  );
}

export function ImageIcon({ size = 44, className }: P) {
  return (
    <svg {...svgProps(size, className)} {...stroke}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
      <path d="M5 18l5-5 3 3 2-2 4 4" />
    </svg>
  );
}

/** Dokumen PDF (merah). */
export function PdfIcon({ size = 44, className }: P) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        fill="#fff"
        stroke="#e53b2f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2v5h5" fill="none" stroke="#e53b2f" strokeWidth="2" strokeLinejoin="round" />
      <rect x="0.8" y="11.5" width="16.4" height="7.5" rx="1.6" fill="#e53b2f" />
      <text x="9" y="17.2" fontSize="5.2" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="Inter, Arial, sans-serif">
        PDF
      </text>
    </svg>
  );
}

/** Dokumen berdaftar (biru) untuk studi kasus dan tes. */
export function DocListIcon({ size = 44, className }: P) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        fill="#fff"
        stroke="#5b83d6"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2v5h5" fill="none" stroke="#5b83d6" strokeWidth="2" strokeLinejoin="round" />
      <g fill="#5b83d6">
        <rect x="7" y="10.5" width="2" height="2" rx="0.4" />
        <rect x="7" y="14" width="2" height="2" rx="0.4" />
        <rect x="7" y="17.5" width="2" height="2" rx="0.4" />
        <rect x="10.5" y="10.9" width="6" height="1.4" rx="0.7" />
        <rect x="10.5" y="14.4" width="6" height="1.4" rx="0.7" />
        <rect x="10.5" y="17.9" width="6" height="1.4" rx="0.7" />
      </g>
    </svg>
  );
}

/** Tautan eksternal (hijau). */
export function LinkIcon({ size = 44, className }: P) {
  return (
    <svg {...svgProps(size, className)} fill="none" stroke="#4ab81e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}
