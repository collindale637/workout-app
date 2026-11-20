/** Small line icons (24×24 viewBox, currentColor) for badges and rows. SVG instead of text glyphs so they sit exactly centred. */
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const ProfileIcon = () => (
  <svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4.5 20c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6" /></svg>
);
export const GymIcon = () => (
  <svg {...base}><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></svg>
);
export const DumbbellIcon = () => (
  <svg {...base}><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></svg>
);
export const MailIcon = () => (
  <svg {...base}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3.5 7.5l8.5 6 8.5-6" /></svg>
);
export const InboxIcon = () => (
  <svg {...base}><path d="M3.5 13l2.7-7.2A2 2 0 0 1 8.1 4.5h7.8a2 2 0 0 1 1.9 1.3l2.7 7.2" /><path d="M3.5 13v4.5a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V13h-5l-1.2 2.2h-5.6L8.5 13z" /></svg>
);
export const SyncIcon = () => (
  <svg {...base}><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 14.3 4.5l1.7-2" /><path d="M20 20v-4.5h-4.5" /></svg>
);
export const SparkleIcon = () => (
  <svg {...base}><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" strokeWidth="1.6" /></svg>
);
export const PlayIcon = () => (
  <svg {...base}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
);
export const PowerIcon = () => (
  <svg {...base}><path d="M12 3.5v8" /><path d="M7 6.8a7.5 7.5 0 1 0 10 0" /></svg>
);
export const InfoIcon = ({ size = 22 }: { size?: number }) => (
  <svg {...base} width={size} height={size}><circle cx="12" cy="12" r="9.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" /></svg>
);

/** Undo: a counter-clockwise hook arrow, drawn like the Regenerate and Customize icons (round caps, same weight). */
export const UndoIcon = ({ size = 18, strokeWidth = 2.5 }: { size?: number; strokeWidth?: number }) => (
  <svg {...base} width={size} height={size} strokeWidth={strokeWidth}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
export const ChevronLeftIcon = () => (
  <svg {...base} width={22} height={22}><path d="M15 5l-7 7 7 7" /></svg>
);
export const ChevronRightIcon = () => (
  <svg {...base} width={22} height={22}><path d="M9 5l7 7-7 7" /></svg>
);
