import { useMemo, useState } from "react";
import type { Task } from "../../types";
import { addDays } from "../utils/planning";
import { IconMenu, IconPlus } from "./icons";
import { compareTasks, type PriorityLevel, priorityLevel } from "./model";
import { TaskRow, taskDropHandlers } from "./parts";
import { QuickAdd } from "./TaskListView";
import { useTick } from "./store";

/**
 * TickTick's Eisenhower Matrix. The quadrant is the task's priority (TickTick's default rule):
 * high (and critical) = Urgent & Important, medium = Not Urgent & Important,
 * low = Urgent & Unimportant, none = Not Urgent & Unimportant. Dropping a task in a quadrant
 * sets that priority.
 */
const QUADRANTS: Array<{ level: PriorityLevel; numeral: string; title: string; color: string; priority: string }> = [
	{ level: "high", numeral: "I", title: "Urgent & Important", color: "var(--tt-q1)", priority: "high" },
	{ level: "medium", numeral: "II", title: "Not Urgent & Important", color: "var(--tt-q2)", priority: "medium" },
	{ level: "low", numeral: "III", title: "Urgent & Unimportant", color: "var(--tt-q3)", priority: "low" },
	{ level: "none", numeral: "IV", title: "Not Urgent & Unimportant", color: "var(--tt-q4)", priority: "" },
];

type Scope = "all" | "week" | "today";

interface MatrixViewProps {
	selectedId: string | null;
	onSelect: (task: Task) => void;
	onToggleSidebar: () => void;
}

export default function MatrixView({ selectedId, onSelect, onToggleSidebar }: MatrixViewProps) {
	const { tasks, isDone, updateTask, today } = useTick();
	const [scope, setScope] = useState<Scope>("all");
	const [adding, setAdding] = useState<PriorityLevel | null>(null);

	const open = useMemo(() => {
		const limit = scope === "today" ? today : scope === "week" ? addDays(today, 6) : null;
		return tasks.filter((task) => {
			if (isDone(task)) return false;
			if (!limit) return true;
			return Boolean(task.dueDate) && (task.dueDate as string).slice(0, 10) <= limit;
		});
	}, [tasks, isDone, scope, today]);

	return (
		<section className="tt-main" aria-label="Eisenhower Matrix">
			<header className="tt-main-head">
				<button type="button" className="tt-icon-btn tt-menu-toggle" aria-label="Open sidebar" onClick={onToggleSidebar}>
					<IconMenu />
				</button>
				<h1 className="tt-main-title">Eisenhower Matrix</h1>
				<div className="tt-seg" role="group" aria-label="Which tasks">
					{(
						[
							["all", "All"],
							["week", "7 Days"],
							["today", "Today"],
						] as const
					).map(([value, label]) => (
						<button
							key={value}
							type="button"
							className={scope === value ? "is-active" : ""}
							onClick={() => setScope(value)}
						>
							{label}
						</button>
					))}
				</div>
			</header>
			<div className="tt-matrix">
				{QUADRANTS.map((quadrant) => {
					const list = open.filter((task) => priorityLevel(task) === quadrant.level).sort(compareTasks);
					return (
						<div
							key={quadrant.level}
							className="tt-quadrant"
							{...taskDropHandlers(
								(task) =>
									void updateTask(task, { priority: quadrant.priority }, { priority: quadrant.priority || undefined }),
								tasks,
							)}
						>
							<div className="tt-quadrant-head" style={{ color: quadrant.color }}>
								<span className="tt-quadrant-badge" style={{ background: quadrant.color }}>
									{quadrant.numeral}
								</span>
								<span style={{ flex: 1 }}>{quadrant.title}</span>
								<span className="tt-group-count">{list.length}</span>
								<button
									type="button"
									className="tt-icon-btn"
									aria-label={`Add task to ${quadrant.title}`}
									onClick={() => setAdding(adding === quadrant.level ? null : quadrant.level)}
								>
									<IconPlus size={14} />
								</button>
							</div>
							<div className="tt-quadrant-body">
								{adding === quadrant.level && (
									<QuickAdd
										ref={(input) => input?.focus()}
										placeholder="Add task, press Enter"
										defaults={{ priority: quadrant.priority || undefined }}
										onCreated={() => setAdding(null)}
									/>
								)}
								{list.map((task) => (
									<TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={onSelect} />
								))}
								{list.length === 0 && adding !== quadrant.level && (
									<div className="tt-quadrant-empty">No tasks. Drag one here.</div>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

