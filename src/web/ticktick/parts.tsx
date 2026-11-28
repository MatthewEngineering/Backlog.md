import { type ReactNode, useEffect, useRef } from "react";
import type { Task } from "../../types";
import { addDays, dueDayKey } from "../utils/planning";
import { IconFlag, IconTick } from "./icons";
import { milestonePath, type PriorityLevel, priorityLevel, relativeDayLabel } from "./model";
import { useTick } from "./store";

export const TASK_DRAG_TYPE = "application/x-backlog-task";

export const PRIORITY_COLOR: Record<PriorityLevel, string> = {
	high: "var(--tt-high)",
	medium: "var(--tt-medium)",
	low: "var(--tt-low)",
	none: "var(--tt-none)",
};

export function Checkbox({ task }: { task: Task }) {
	const { isDone, toggleComplete } = useTick();
	const done = isDone(task);
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={done}
			aria-label={done ? `Mark "${task.title}" not done` : `Complete "${task.title}"`}
			className={`tt-check p-${priorityLevel(task)} ${done ? "is-checked" : ""}`}
			onClick={(event) => {
				event.stopPropagation();
				toggleComplete(task);
			}}
		>
			<IconTick size={11} />
		</button>
	);
}

export function DueLabel({ task }: { task: Task }) {
	const { today } = useTick();
	const due = dueDayKey(task);
	if (!due) return null;
	const tone = due < today ? "is-overdue" : due > addDays(today, 1) ? "is-future" : "";
	return <span className={`tt-date ${tone}`}>{relativeDayLabel(due, today)}</span>;
}

interface TaskRowProps {
	task: Task;
	selected: boolean;
	onSelect: (task: Task) => void;
	showList?: boolean;
	showDate?: boolean;
}

export function TaskRow({ task, selected, onSelect, showList = true, showDate = true }: TaskRowProps) {
	const { milestones, isDone } = useTick();
	const list = showList ? milestonePath(task.milestone, milestones) : "";
	return (
		<div
			className={`tt-task ${selected ? "is-selected" : ""} ${isDone(task) ? "is-done" : ""}`}
			draggable
			onDragStart={(event) => {
				event.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
				event.dataTransfer.effectAllowed = "move";
				event.currentTarget.classList.add("is-dragging");
			}}
			onDragEnd={(event) => event.currentTarget.classList.remove("is-dragging")}
			onClick={() => onSelect(task)}
			onKeyDown={(event) => {
				if (event.key === "Enter") onSelect(task);
			}}
			tabIndex={0}
			role="option"
			aria-selected={selected}
			data-task-id={task.id}
		>
			<Checkbox task={task} />
			<span className="tt-task-title">{task.title}</span>
			<span className="tt-task-meta">
				{task.labels.slice(0, 1).map((label) => (
					<span key={label} className="tt-tag">
						{label}
					</span>
				))}
				{list && <span className="tt-task-list">{list}</span>}
				{showDate && <DueLabel task={task} />}
			</span>
		</div>
	);
}

/** Read the task a drop carries. */
export function droppedTaskId(event: React.DragEvent): string | null {
	return event.dataTransfer.getData(TASK_DRAG_TYPE) || null;
}

export function acceptsTask(event: React.DragEvent): boolean {
	return event.dataTransfer.types.includes(TASK_DRAG_TYPE);
}

/** Drag-over/leave/drop handlers that highlight the target with `is-drop` and hand over the task. */
export function taskDropHandlers(onDropTask: (task: Task) => void, tasks: readonly Task[]) {
	return {
		onDragOver: (event: React.DragEvent<HTMLElement>) => {
			if (!acceptsTask(event)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			event.currentTarget.classList.add("is-drop");
		},
		onDragLeave: (event: React.DragEvent<HTMLElement>) => {
			if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
				event.currentTarget.classList.remove("is-drop");
			}
		},
		onDrop: (event: React.DragEvent<HTMLElement>) => {
			event.currentTarget.classList.remove("is-drop");
			const id = droppedTaskId(event);
			const task = id ? tasks.find((candidate) => candidate.id === id) : undefined;
			if (!task) return;
			event.preventDefault();
			onDropTask(task);
		},
	};
}

/** A floating panel that closes on outside click or Escape. */
export function Popover({
	onClose,
	children,
	style,
	className = "",
}: {
	onClose: () => void;
	children: ReactNode;
	style?: React.CSSProperties;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const onPointer = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) onClose();
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		// Deferred so the click that opened the popover does not close it.
		const timer = setTimeout(() => document.addEventListener("mousedown", onPointer));
		document.addEventListener("keydown", onKey);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [onClose]);
	return (
		<div ref={ref} className={`tt-popover ${className}`} style={style} onClick={(event) => event.stopPropagation()}>
			{children}
		</div>
	);
}

function nextMonday(today: string): string {
	const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
	return addDays(today, ((8 - weekday) % 7) || 7);
}

export function DatePicker({
	value,
	onChange,
	onClose,
	style,
}: {
	value: string | null;
	onChange: (day: string | null) => void;
	onClose: () => void;
	style?: React.CSSProperties;
}) {
	const { today } = useTick();
	const choices: Array<{ label: string; day: string; glyph: string }> = [
		{ label: "Today", day: today, glyph: "☀" },
		{ label: "Tomorrow", day: addDays(today, 1), glyph: "🌤" },
		{ label: "Next Mon", day: nextMonday(today), glyph: "7" },
		{ label: "+1 week", day: addDays(today, 7), glyph: "➜" },
	];
	return (
		<Popover onClose={onClose} style={{ width: 260, ...style }}>
			<div className="tt-quick-dates">
				{choices.map((choice) => (
					<button
						key={choice.label}
						type="button"
						className="tt-quick-date"
						onClick={() => {
							onChange(choice.day);
							onClose();
						}}
					>
						<span style={{ fontSize: 16 }}>{choice.glyph}</span>
						{choice.label}
					</button>
				))}
			</div>
			<div style={{ padding: "0 6px 6px" }}>
				<input
					type="date"
					className="tt-input"
					value={value ?? ""}
					onChange={(event) => {
						if (event.target.value) {
							onChange(event.target.value);
							onClose();
						}
					}}
				/>
			</div>
			{value && (
				<>
					<div className="tt-menu-sep" />
					<button
						type="button"
						className="tt-menu-item is-danger"
						onClick={() => {
							onChange(null);
							onClose();
						}}
					>
						Clear date
					</button>
				</>
			)}
		</Popover>
	);
}

export const PRIORITY_CHOICES: Array<{ value: string; label: string; level: PriorityLevel }> = [
	{ value: "high", label: "High Priority", level: "high" },
	{ value: "medium", label: "Medium Priority", level: "medium" },
	{ value: "low", label: "Low Priority", level: "low" },
	{ value: "", label: "No Priority", level: "none" },
];

export function PriorityPicker({
	value,
	onChange,
	onClose,
	style,
}: {
	value: string | undefined;
	onChange: (priority: string) => void;
	onClose: () => void;
	style?: React.CSSProperties;
}) {
	const { priorities } = useTick();
	const extra = priorities.filter((priority) => !["high", "medium", "low"].includes(priority.toLowerCase()));
	const choices = [
		...extra.map((priority) => ({ value: priority, label: `${priority[0]?.toUpperCase()}${priority.slice(1)}`, level: "high" as const })),
		...PRIORITY_CHOICES,
	];
	return (
		<Popover onClose={onClose} style={style}>
			{choices.map((choice) => (
				<button
					key={choice.value || "none"}
					type="button"
					className="tt-menu-item"
					style={(value ?? "").toLowerCase() === choice.value ? { background: "var(--tt-hover)" } : undefined}
					onClick={() => {
						onChange(choice.value);
						onClose();
					}}
				>
					<IconFlag color={PRIORITY_COLOR[choice.level]} />
					{choice.label}
				</button>
			))}
		</Popover>
	);
}

/**
 * A draggable vertical divider between two panes. `edge` says which side of the pane being sized
 * the divider sits on: "right" grows the pane as the pointer moves right (a left sidebar), "left"
 * grows it as the pointer moves left (a right-hand panel). Dragging well past `min` calls
 * `onCollapse` when given. Arrow keys nudge it; a double click puts it back to `reset`.
 */
export function ResizeHandle({
	value,
	onChange,
	min,
	max,
	reset,
	edge,
	label,
	onCollapse,
	className = "",
}: {
	value: number;
	onChange: (width: number) => void;
	min: number;
	max: number;
	reset: number;
	edge: "left" | "right";
	label: string;
	onCollapse?: () => void;
	className?: string;
}) {
	const clamp = (width: number) => Math.min(max, Math.max(min, Math.round(width)));
	return (
		// biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA pattern for a splitter
		<div
			className={`tt-resize ${className}`}
			role="separator"
			aria-orientation="vertical"
			aria-label={label}
			aria-valuenow={value}
			aria-valuemin={min}
			aria-valuemax={max}
			tabIndex={0}
			title={`Drag to resize${onCollapse ? ", or drag all the way to hide" : ""}. Double-click to reset.`}
			onDoubleClick={() => onChange(reset)}
			onKeyDown={(event) => {
				const step = event.shiftKey ? 64 : 16;
				const grow = edge === "right" ? "ArrowRight" : "ArrowLeft";
				const shrink = edge === "right" ? "ArrowLeft" : "ArrowRight";
				if (event.key === grow) onChange(clamp(value + step));
				else if (event.key === shrink) onChange(clamp(value - step));
				else return;
				event.preventDefault();
			}}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				const handle = event.currentTarget;
				handle.setPointerCapture(event.pointerId);
				handle.classList.add("is-dragging");
				document.body.style.cursor = "col-resize";
				const startX = event.clientX;
				const startWidth = value;
				let collapsed = false;
				const move = (moveEvent: PointerEvent) => {
					const delta = (moveEvent.clientX - startX) * (edge === "right" ? 1 : -1);
					const raw = startWidth + delta;
					if (onCollapse && raw < min - 80) {
						if (!collapsed) {
							collapsed = true;
							onCollapse();
						}
						return;
					}
					onChange(clamp(raw));
				};
				const end = () => {
					handle.classList.remove("is-dragging");
					document.body.style.cursor = "";
					handle.removeEventListener("pointermove", move);
					handle.removeEventListener("pointerup", end);
					handle.removeEventListener("pointercancel", end);
				};
				handle.addEventListener("pointermove", move);
				handle.addEventListener("pointerup", end);
				handle.addEventListener("pointercancel", end);
			}}
		/>
	);
}
