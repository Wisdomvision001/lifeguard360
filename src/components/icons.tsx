import type { JSX } from "react";

/**
 * Typed icon registry — inline SVGs ported from the legacy prototype.
 * All icons are stroke-based, inherit `currentColor`, and size via props.
 */

export const ICON_NAMES = [
  "home",
  "first-aid",
  "sos",
  "facility",
  "contacts",
  "history",
  "settings",
  "heart-pulse",
  "bell",
  "menu",
  "close",
  "phone",
  "message",
  "map-pin",
  "share",
  "chevron",
  "check",
  "alert",
  "play",
  "pause",
  "stop",
  "download",
  "upload",
  "user",
  "logout",
  "offline",
  "wifi",
  "external",
  "search",
  "spinner",
  "flame",
  "droplet",
  "person-choking",
  "snake",
  "car",
  "bone",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const PATHS: Record<IconName, JSX.Element> = {
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </>
  ),
  "first-aid": (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  sos: <path d="M13 2 3 14h7l-1 8 11-14h-7z" />,
  facility: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />,
  contacts: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  "heart-pulse": (
    <>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      <path d="M8 12h2l1.5-3 2 5 1.5-2H16" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  "map-pin": (
    <>
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  share: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </>
  ),
  chevron: <path d="M9 18l6-6-6-6" />,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  play: <path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor" stroke="none" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none" />,
  download: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  offline: (
    <path d="M3 3l18 18M8.53 9.47A5 5 0 0 0 12 17h5a4 4 0 0 0 3.87-3M16.8 8.15A6.5 6.5 0 0 0 5 9a7 7 0 0 0 1 13h9" />
  ),
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <path d="M12 20h.01" />
    </>
  ),
  external: (
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </>
  ),
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  flame: (
    <path d="M12 22c4.4 0 8-3.1 8-7.5 0-2.4-1.2-4.6-2.7-6.4-.6 1-1.4 1.9-2.3 2.4C14.7 7.6 13.4 4 10.9 2c.3 2.3-.7 4.3-2.2 6C7.1 9.9 6 11.9 6 14.5 6 18.9 7.6 22 12 22z" />
  ),
  droplet: <path d="M12 2.7 6.7 8.9c-2.9 3.4-2.4 8.3 1 11.2 2.5 2.1 6.1 2.1 8.6 0 3.4-2.9 3.9-7.8 1-11.2L12 2.7z" />,
  "person-choking": (
    <>
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M12 7v5M12 12l-3 5M12 12l3 5M9.5 9.5h5M9 17h6" />
    </>
  ),
  snake: (
    <>
      <path d="M4 18c3 0 3-4 6-4s3 2 6 2 4-2 4-4-1.5-4-4-4" />
      <circle cx="4.5" cy="18" r="1.6" />
      <path d="M20.5 5.5 19 4M20.5 5.5 22 4" />
    </>
  ),
  car: (
    <>
      <path d="M5 16 6.2 9.3A2 2 0 0 1 8.2 8h7.6a2 2 0 0 1 2 1.3L19 16" />
      <path d="M4 16h16v3a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3z" />
      <path d="M7.5 12.5h9" />
    </>
  ),
  bone: (
    <>
      <path d="M17 10c1.2.3 2.5-.2 3.1-1.3a2.4 2.4 0 0 0-2.5-3.6A2.4 2.4 0 0 0 14 2.9c-1.1.6-1.6 2-1.3 3.1L10 8.7c-1.2-.3-2.5.2-3.1 1.3a2.4 2.4 0 0 0 2.5 3.6 2.4 2.4 0 0 0 3.6 2.5c1.1-.6 1.6-2 1.3-3.1L17 10z" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** Pixel size; default 20. */
  size?: number;
  className?: string;
  /** Decorative by default; pass a label for meaningful icons. */
  label?: string;
}

export function Icon({ name, size = 20, className, label }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Brand shield + cross mark from the prototype sidebar. */
export function BrandMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 2 L32 8 V17 C32 25.5 26 31.5 18 34 C10 31.5 4 25.5 4 17 V8 Z" fill="#E0342C" />
      <path d="M18 11 V25 M11 18 H25" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
