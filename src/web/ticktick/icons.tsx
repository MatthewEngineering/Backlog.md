import type { ReactNode } from "react";

/** Line icons for the task app, drawn on a 24px grid with the current text colour. */
function Svg({ size = 18, children, fill = "none" }: { size?: number; children: ReactNode; fill?: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={fill}
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

type IconProps = { size?: number };

export const IconCheckSquare = ({ size }: IconProps) => (
	<Svg size={size}>
		<rect x="3.5" y="3.5" width="17" height="17" rx="3" />
		<path d="m8 12 3 3 5-6" />
	</Svg>
);
export const IconCalendar = ({ size }: IconProps) => (
	<Svg size={size}>
		<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
		<path d="M3.5 10h17M8 3v4M16 3v4" />
	</Svg>
);
export const IconMatrix = ({ size }: IconProps) => (
	<Svg size={size}>
		<rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
		<rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
		<rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
		<rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
	</Svg>
);
export const IconTimer = ({ size }: IconProps) => (
	<Svg size={size}>
		<circle cx="12" cy="13" r="8" />
		<path d="M12 9v4l2.5 2.5M9.5 2.5h5" />
	</Svg>
);
export const IconSearch = ({ size }: IconProps) => (
	<Svg size={size}>
		<circle cx="11" cy="11" r="6.5" />
		<path d="m20 20-4.2-4.2" />
	</Svg>
);
export const IconBoard = ({ size }: IconProps) => (
	<Svg size={size}>
		<rect x="3.5" y="4" width="5" height="16" rx="1.5" />
		<rect x="10" y="4" width="5" height="11" rx="1.5" />
		<rect x="16.5" y="4" width="4" height="7" rx="1.5" />
	</Svg>
);
export const IconSettings = ({ size }: IconProps) => (
	<Svg size={size}>
		<circle cx="12" cy="12" r="3" />
		<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
	</Svg>
);
export const IconSun = ({ size }: IconProps) => (
	<Svg size={size}>
		<rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
		<path d="M3.5 9.5h17" />
		<text x="12" y="18.2" textAnchor="middle" fontSize="7.5" stroke="none" fill="currentColor" fontWeight="700">
			{new Date().getDate()}
		</text>
	</Svg>
);
export const IconWeek = ({ size }: IconProps) => (
	<Svg size={size}>
		<rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
		<path d="M3.5 9.5h17" />
		<text x="12" y="18.2" textAnchor="middle" fontSize="7.5" stroke="none" fill="currentColor" fontWeight="700">
			7
		</text>
	</Svg>
);
export const IconInbox = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M3.5 13.5 6 5.5h12l2.5 8V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z" />
		<path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
	</Svg>
);
export const IconAll = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M4 6h16M4 12h16M4 18h16" />
	</Svg>
);
export const IconDone = ({ size }: IconProps) => (
	<Svg size={size}>
		<circle cx="12" cy="12" r="8.5" />
		<path d="m8.5 12 2.5 2.5 4.5-5" />
	</Svg>
);
export const IconList = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M9 6h11M9 12h11M9 18h11" />
		<circle cx="4.5" cy="6" r="1" fill="currentColor" />
		<circle cx="4.5" cy="12" r="1" fill="currentColor" />
		<circle cx="4.5" cy="18" r="1" fill="currentColor" />
	</Svg>
);
export const IconFolder = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
	</Svg>
);
export const IconTag = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z" />
		<circle cx="8" cy="8" r="1.3" fill="currentColor" />
	</Svg>
);
export const IconPlus = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M12 5v14M5 12h14" />
	</Svg>
);
export const IconMore = ({ size }: IconProps) => (
	<Svg size={size}>
		<circle cx="5.5" cy="12" r="1" fill="currentColor" />
		<circle cx="12" cy="12" r="1" fill="currentColor" />
		<circle cx="18.5" cy="12" r="1" fill="currentColor" />
	</Svg>
);
export const IconCaret = ({ size = 12 }: IconProps) => (
	<Svg size={size}>
		<path d="m9 6 6 6-6 6" />
	</Svg>
);
export const IconChevronLeft = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="m15 6-6 6 6 6" />
	</Svg>
);
export const IconChevronRight = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="m9 6 6 6-6 6" />
	</Svg>
);
export const IconMenu = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M4 7h16M4 12h16M4 17h16" />
	</Svg>
);
export const IconClose = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="m6 6 12 12M18 6 6 18" />
	</Svg>
);
export const IconTick = ({ size = 12 }: IconProps) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} aria-hidden="true">
		<path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);
export const IconFlag = ({ size = 16, color }: IconProps & { color: string }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
		<path d="M5 21V4.5M5 4.5h11.5l-2.5 4 2.5 4H5" fill={color} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
	</svg>
);
export const IconExpand = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
	</Svg>
);
export const IconTrash = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
	</Svg>
);
export const IconSunny = ({ size }: IconProps) => (
	<Svg size={size}>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
	</Svg>
);
export const IconMoon = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
	</Svg>
);
export const IconSort = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />
	</Svg>
);
export const IconMilestone = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M5 21V4" />
		<path d="M5 4h11l-2.5 4L16 12H5" />
	</Svg>
);
export const IconGantt = ({ size }: IconProps) => (
	<Svg size={size}>
		<path d="M4 4v16h16" />
		<rect x="7" y="7" width="7" height="3" rx="1" />
		<rect x="10" y="13" width="8" height="3" rx="1" />
	</Svg>
);
