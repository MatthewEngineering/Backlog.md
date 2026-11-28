import { useMemo, useState } from "react";
import type { Task } from "../../types";
import { addDays, addMonths, dueDayKey, formatDay, monthGridDays, weekDays } from "../utils/planning";
import { IconChevronLeft, IconChevronRight, IconMenu } from "./icons";
import { compareTasks, priorityLevel } from "./model";
import { Popover, TASK_DRAG_TYPE, TaskRow, taskDropHandlers } from "./parts";
import { QuickAdd } from "./TaskListView";
import { useTick } from "./store";

type Mode = "month" | "week";

interface CalendarViewProps {
	selectedId: string | null;
	onSelect: (task: Task) => void;
	onToggleSidebar: () => void;
}

export default function CalendarView({ selectedId, onSelect, onToggleSidebar }: CalendarViewProps) {
	const { tasks, today, isDone, updateTask } = useTick();
	const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 768 ? "week" : "month"));
	const [anchor, setAnchor] = useState(today);
	const [openDay, setOpenDay] = useState<string | null>(null);
	const [showTray, setShowTray] = useState(() => window.innerWidth >= 1280);

	const days = mode === "month" ? monthGridDays(anchor) : weekDays(anchor);
	const byDay = useMemo(() => {
		const map = new Map<string, Task[]>();
		for (const task of tasks) {
			const day = dueDayKey(task);
			if (!day) continue;
			map.set(day, [...(map.get(day) ?? []), task]);
		}
		for (const list of map.values()) list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || compareTasks(a, b));
		return map;
	}, [tasks, isDone]);
	const unscheduled = useMemo(
		() => tasks.filter((task) => !isDone(task) && !dueDayKey(task)).sort(compareTasks),
		[tasks, isDone],
	);

	const month = anchor.slice(0, 7);
	const title =
		mode === "month"
			? formatDay(anchor, { month: "long", year: "numeric" })
			: `${formatDay(days[0] as string, { month: "short", day: "numeric" })} – ${formatDay(days[6] as string, { month: "short", day: "numeric", year: "numeric" })}`;
	const step = (direction: number) =>
		setAnchor(mode === "month" ? addMonths(anchor, direction) : addDays(anchor, 7 * direction));
	const maxChips = mode === "month" ? 4 : 50;

	return (
		<section className="tt-main" aria-label="Calendar">
			<header className="tt-main-head">
				<button type="button" className="tt-icon-btn tt-menu-toggle" aria-label="Open sidebar" onClick={onToggleSidebar}>
					<IconMenu />
				</button>
				<h1 className="tt-main-title">{title}</h1>
				<div className="tt-seg" role="group" aria-label="Calendar view">
					{(["month", "week"] as const).map((value) => (
						<button key={value} type="button" className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>
							{value === "month" ? "Month" : "Week"}
						</button>
					))}
				</div>
				<button type="button" className="tt-icon-btn" aria-label="Previous" onClick={() => step(-1)}>
					<IconChevronLeft />
				</button>
				<button type="button" className="tt-btn" onClick={() => setAnchor(today)}>
					Today
				</button>
				<button type="button" className="tt-icon-btn" aria-label="Next" onClick={() => step(1)}>
					<IconChevronRight />
				</button>
				<button
					type="button"
					className={`tt-btn ${showTray ? "is-primary" : ""}`}
					title="Tasks without a date, to drag onto the calendar"
					onClick={() => setShowTray((value) => !value)}
				>
					Unscheduled {unscheduled.length}
				</button>
			</header>
			<div style={{ flex: 1, display: "flex", minHeight: 0 }}>
				<div className="tt-cal">
					<div className="tt-cal-weekdays">
						{weekDays(today).map((day, index) => (
							<div key={day}>
								{mode === "week"
									? formatDay(days[index] as string, { weekday: "short", day: "numeric" })
									: formatDay(day, { weekday: "short" })}
							</div>
						))}
					</div>
					<div className="tt-cal-grid" style={mode === "week" ? { gridAutoRows: "1fr" } : undefined}>
						{days.map((day) => {
							const list = byDay.get(day) ?? [];
							const other = mode === "month" && day.slice(0, 7) !== month;
							return (
								<div
									key={day}
									className={`tt-cal-cell ${other ? "is-other" : ""} ${day === today ? "is-today" : ""}`}
									style={{ position: "relative" }}
									onDoubleClick={() => setOpenDay(day)}
									{...taskDropHandlers((task) => void updateTask(task, { dueDate: day }, { dueDate: day }), tasks)}
								>
									<button
										type="button"
										className="tt-cal-day"
										aria-label={`Open ${day}`}
										onClick={() => setOpenDay(openDay === day ? null : day)}
									>
										{Number(day.slice(8))}
									</button>
									{list.slice(0, maxChips).map((task) => (
										<div
											key={task.id}
											className={`tt-cal-task p-${priorityLevel(task)} ${isDone(task) ? "is-done" : ""}`}
											style={task.id === selectedId ? { outline: "1px solid var(--tt-accent)" } : undefined}
											draggable
											onDragStart={(event) => event.dataTransfer.setData(TASK_DRAG_TYPE, task.id)}
											onClick={() => onSelect(task)}
											title={task.title}
										>
											{task.title}
										</div>
									))}
									{list.length > maxChips && (
										<button type="button" className="tt-cal-more" onClick={() => setOpenDay(day)}>
											+{list.length - maxChips} more
										</button>
									)}
									{openDay === day && (
										<Popover
											onClose={() => setOpenDay(null)}
											style={{ top: 26, left: 0, width: 300, maxHeight: 360, overflowY: "auto" }}
										>
											<div style={{ fontWeight: 600, padding: "4px 6px 8px" }}>
												{formatDay(day, { weekday: "long", month: "long", day: "numeric" })}
											</div>
											<QuickAdd placeholder="Add task on this day" defaults={{ dueDate: day }} />
											{list.map((task) => (
												<TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={onSelect} showDate={false} />
											))}
										</Popover>
									)}
								</div>
							);
						})}
					</div>
				</div>
				{showTray && (
					<aside
						style={{
							width: 260,
							flex: "none",
							borderLeft: "1px solid var(--tt-border)",
							overflowY: "auto",
							padding: "0 8px 16px",
						}}
						aria-label="Unscheduled tasks"
						{...taskDropHandlers((task) => void updateTask(task, { dueDate: null }, { dueDate: undefined }), tasks)}
					>
						<div className="tt-group-head" style={{ padding: "0 6px" }}>
							Unscheduled <span className="tt-group-count">{unscheduled.length}</span>
						</div>
						{unscheduled.map((task) => (
							<TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={onSelect} showDate={false} />
						))}
					</aside>
				)}
			</div>
		</section>
	);
}
