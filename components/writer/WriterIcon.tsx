import type { ReactNode, SVGProps } from "react";

export type WriterIconName =
  | "chevronDown"
  | "collapse"
  | "expand"
  | "history"
  | "eye"
  | "ideas"
  | "insert"
  | "more"
  | "panelLeft"
  | "panelRight"
  | "redo"
  | "refresh"
  | "search"
  | "soundOff"
  | "soundOn"
  | "undo";

const paths: Record<WriterIconName, ReactNode> = {
  chevronDown: <path d="m6 9 6 6 6-6" />,
  collapse: <><path d="M8 3v5H3" /><path d="m3 8 5-5" /><path d="M16 21v-5h5" /><path d="m21 16-5 5" /></>,
  expand: <><path d="M8 3H3v5" /><path d="m3 3 6 6" /><path d="M16 21h5v-5" /><path d="m21 21-6-6" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  ideas: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.3 14.7A7 7 0 1 1 15.7 14.7c-.9.7-1.4 1.6-1.5 2.3h-4.4c-.1-.7-.6-1.6-1.5-2.3Z" /></>,
  insert: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  panelLeft: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  panelRight: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  redo: <><path d="m15 7 4 4-4 4" /><path d="M19 11h-8a6 6 0 0 0-6 6" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10" /><path d="M3 4v6h6" /><path d="M4 13a8 8 0 0 0 14.8 4l2.2-3" /><path d="M21 20v-6h-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  soundOff: <><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="m16 9 5 6" /><path d="m21 9-5 6" /></>,
  soundOn: <><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15 9a4 4 0 0 1 0 6" /><path d="M18 6a8 8 0 0 1 0 12" /></>,
  undo: <><path d="m9 7-4 4 4 4" /><path d="M5 11h8a6 6 0 0 1 6 6" /></>,
};

export default function WriterIcon({
  name,
  size = 16,
  ...props
}: SVGProps<SVGSVGElement> & { name: WriterIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="writer-icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}
