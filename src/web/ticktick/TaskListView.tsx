import { forwardRef, useEffect, useMemo, useState } from "react";
import type { Task } from "../../types";
import { IconCaret, IconMenu, IconPlus, IconSearch, IconSort } from "./icons";
import {
	compareTasks,
	groupByDate,
	milestonePath,
	nextSevenDayGroups,
	parseQuickAdd,
	priorityLevel,
	type TaskGroup,
	tasksForView,
	type ViewSpec,
} from "./model";
import { Popover, TaskRow, taskDropHandlers } from "./parts";
import { type NewTaskInput, useTick } from "./store";

export type GroupMode = "date" | "priority" | "list" | "none";

const GROUP_MODES: readonly GroupMode[] = ["date", "priority", "list", "none"];
const GROUP_LABELS: Record<GroupMode, string> = { date: "Date", priority: "Priority", list: "List", none: "None" };

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
	try {
		const value = localStorage.getItem(key) as T | null;
		return value && allowed.includes(value) ? value : fallback;
	} catch {
		return fallback;
	}
}

function writePref(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Preferences are a convenience; a blocked storage just forgets them.
	}
}

interface QuickAddProps {
	placeholder: string;
	defaults: Partial<NewTaskInput>;
	onCreated?: (task: Task) => void;
}

/** The "+ Add task" line, with TickTick's smart syntax previewed as chips while typing. */
export const QuickAdd = forwardRef<HTMLInputElement, QuickAddProps>(function QuickAdd(
	{ placeholder, defaults, onCreated },
	ref,
) {
	const { today, milestones, projects, priorities, createTask } = useTick();
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const parsed = useMemo(
		() => parseQuickAdd(text, { today, milestones, projects, priorities }),
		[text, today, milestones, projects, priorities],
	);
	const submit = async () => {
		if (!parsed.title || busy) return;
		setBusy(true);
		const created = await createTask({
			...defaults,
			title: parsed.title,
			dueDate: parsed.dueDate ?? defaults.dueDate,
			priority: parsed.priority ?? defaults.priority,
			milestone: parsed.milestone ?? defaults.milestone,
			project: parsed.project ?? defaults.project,
			labels: [...(defaults.labels ?? []), ...parsed.labels],
		});
		setBusy(false);
		if (created) {
			setText("");
			onCreated?.(created);
		}
	};
	const chips = [
		parsed.dueDate && `📅 ${parsed.dueDate}`,
		parsed.priority && `⚑ ${parsed.priority}`,
		parsed.milestone && `☰ ${milestonePath(parsed.milestone, milestones)}`,
		parsed.project && `▣ ${parsed.project}`,
		...parsed.labels.map((label) => `# ${label}`),
	].filter(Boolean) as string[];
	return (
		<>
			<div className="tt-quickadd">
				<span style={{ color: "var(--tt-accent)", display: "grid" }}>
					<IconPlus size={16} />
				</span>
				<input
					ref={ref}
					value={text}
					disabled={busy}
					placeholder={placeholder}
					aria-label="Add task"
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") void submit();
						if (event.key === "Escape") {
							setText("");
							event.currentTarget.blur();
						}
					}}
				/>
			</div>
			{text && chips.length > 0 && (
				<div className="tt-quickadd-hint">
					{chips.map((chip) => (
						<span key={chip} className="tt-chip">
							{chip}
						</span>
					))}
				</div>
			)}
		</>
	);
});

interface TaskListViewProps {
	view: ViewSpec;
	title: string;
	selectedId: string | null;
	onSelect: (task: Task) => void;
	onToggleSidebar: () => void;
	quickAddRef: React.RefObject<HTMLInputElement | null>;
	searchRef: React.RefObject<HTMLInputElement | null>;
	onSearch: (query: string) => void;
}

export default function TaskListView({
	view,
	title,
	selectedId,
	onSelect,
	onToggleSidebar,
	quickAddRef,
	searchRef,
	onSearch,
}: TaskListViewProps) {
	const store = useTick();
	const { tasks, milestones, statuses, today, isDone, updateTask } = store;
	const defaultGroup: GroupMode = view.kind === "completed" || view.kind === "search" ? "none" : "date";
	const prefKey = `tt-group-${view.kind}`;
	const [groupMode, setGroupMode] = useState<GroupMode>(() => readPref<GroupMode>(prefKey, defaultGroup, GROUP_MODES));
	useEffect(() => setGroupMode(readPref<GroupMode>(prefKey, defaultGroup, GROUP_MODES)), [prefKey, defaultGroup]);
	const [showMenu, setShowMenu] = useState(false);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["completed"]));

	const viewTasks = useMemo(
		() => tasksForView(tasks, view, { statuses, today, milestones }),
		[tasks, view, statuses, today, milestones],
	);
	const showsDone = view.kind === "completed";
	const openTasks = showsDone ? viewTasks : viewTasks.filter((task) => !isDone(task));
	const doneTasks = showsDone ? [] : viewTasks.filter((task) => isDone(task));

	const groups: TaskGroup[] = useMemo(() => {
		if (view.kind === "next7" && groupMode === "date") return nextSevenDayGroups(openTasks, today);
		if (groupMode === "date") return groupByDate(openTasks, today);
		if (groupMode === "priority") {
			const order = ["high", "medium", "low", "none"] as const;
			const labels = { high: "High Priority", medium: "Medium Priority", low: "Low Priority", none: "No Priority" };
			return order
				.map((level) => ({
					key: level,
					label: labels[level],
					tasks: openTasks.filter((task) => priorityLevel(task) === level).sort(compareTasks),
				}))
				.filter((group) => group.tasks.length > 0);
		}
		if (groupMode === "list") {
			const byList = new Map<string, Task[]>();
			for (const task of openTasks) {
				const key = milestonePath(task.milestone, milestones) || "Inbox";
				byList.set(key, [...(byList.get(key) ?? []), task]);
			}
			return [...byList.entries()]
				.sort(([a], [b]) => (a === "Inbox" ? -1 : b === "Inbox" ? 1 : a.localeCompare(b)))
				.map(([key, list]) => ({ key, label: key, tasks: list.sort(compareTasks) }));
		}
		const sorted = showsDone
			? [...openTasks].sort((a, b) => (b.updatedDate ?? "").localeCompare(a.updatedDate ?? ""))
			: [...openTasks].sort(compareTasks);
		return [{ key: "all", label: "", tasks: sorted }];
	}, [groupMode, openTasks, today, milestones, view.kind, showsDone]);

	const defaults: Partial<NewTaskInput> = useMemo(() => {
		switch (view.kind) {
			case "today":
			case "next7":
				return { dueDate: today };
			case "list":
				return { milestone: view.milestoneId };
			case "area":
				return { project: view.project };
			case "tag":
				return { labels: [view.label] };
			default:
				return {};
		}
	}, [view, today]);

	const toggleGroup = (key: string) =>
		setCollapsed((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const dropOnGroup = (group: TaskGroup) => {
		if (groupMode === "date") {
			if (group.day) return (task: Task) => void updateTask(task, { dueDate: group.day }, { dueDate: group.day });
			if (group.key === "nodate") return (task: Task) => void updateTask(task, { dueDate: null }, { dueDate: undefined });
		}
		if (groupMode === "priority") {
			const value = group.key === "none" ? "" : group.key;
			return (task: Task) => void updateTask(task, { priority: value }, { priority: value || undefined });
		}
		return null;
	};

	const total = openTasks.length;
	const quickAddAllowed = view.kind !== "completed" && view.kind !== "search";

	return (
		<section className="tt-main" aria-label={title}>
			<header className="tt-main-head">
				<button type="button" className="tt-icon-btn tt-menu-toggle" aria-label="Open lists" onClick={onToggleSidebar}>
					<IconMenu />
				</button>
				<h1 className="tt-main-title">
					{title}
					<span className="tt-main-sub">{total}</span>
				</h1>
				<div style={{ position: "relative" }}>
					<button
						type="button"
						className="tt-icon-btn"
						aria-label="Group by"
						title="Group by"
						onClick={() => setShowMenu((open) => !open)}
					>
						<IconSort />
					</button>
					{showMenu && (
						<Popover onClose={() => setShowMenu(false)} style={{ right: 0, top: 30 }}>
							<div style={{ padding: "4px 10px", fontSize: 12, color: "var(--tt-text-3)" }}>Group by</div>
							{(Object.keys(GROUP_LABELS) as GroupMode[]).map((mode) => (
								<button
									key={mode}
									type="button"
									className="tt-menu-item"
									onClick={() => {
										setGroupMode(mode);
										writePref(prefKey, mode);
										setShowMenu(false);
									}}
								>
									<span style={{ width: 14, color: "var(--tt-accent)" }}>{groupMode === mode ? "✓" : ""}</span>
									{GROUP_LABELS[mode]}
								</button>
							))}
						</Popover>
					)}
				</div>
			</header>
			<div className="tt-main-scroll" role="listbox" aria-label={`${title} tasks`}>
				{view.kind === "search" && (
					<div className="tt-quickadd">
						<span style={{ color: "var(--tt-text-3)", display: "grid" }}>
							<IconSearch size={16} />
						</span>
						<input
							ref={searchRef}
							autoFocus
							defaultValue={view.query}
							placeholder="Search tasks by title, description, ID or tag"
							aria-label="Search tasks"
							onChange={(event) => onSearch(event.target.value)}
						/>
					</div>
				)}
				{quickAddAllowed && (
					<QuickAdd
						ref={quickAddRef}
						placeholder={`+ Add task to "${title}", press Enter to save. Try: tomorrow !high #tag ~list`}
						defaults={defaults}
						onCreated={(task) => onSelect(task)}
					/>
				)}
				{total === 0 && doneTasks.length === 0 && view.kind !== "next7" && <EmptyState view={view} />}
				{groups.map((group) => {
					const onDrop = dropOnGroup(group);
					const isCollapsed = collapsed.has(group.key);
					return (
						<div
							key={group.key}
							className="tt-group"
							{...(onDrop ? taskDropHandlers(onDrop, tasks) : {})}
						>
							{group.label && (
								<div
									className={`tt-group-head ${group.tone === "overdue" ? "is-overdue" : ""}`}
									onClick={() => toggleGroup(group.key)}
								>
									<span className={`tt-caret ${isCollapsed ? "" : "is-open"}`}>
										<IconCaret />
									</span>
									{group.label}
									<span className="tt-group-count">{group.tasks.length}</span>
									{group.tone === "overdue" && group.tasks.length > 0 && (
										<button
											type="button"
											className="tt-group-action"
											onClick={(event) => {
												event.stopPropagation();
												for (const task of group.tasks) void updateTask(task, { dueDate: today }, { dueDate: today });
											}}
										>
											Postpone to today
										</button>
									)}
								</div>
							)}
							{!isCollapsed &&
								group.tasks.map((task) => (
									<TaskRow
										key={task.id}
										task={task}
										selected={task.id === selectedId}
										onSelect={onSelect}
										showList={view.kind !== "list" || groupMode !== "list"}
										showDate={!(groupMode === "date" && group.day)}
									/>
								))}
							{!isCollapsed && group.tasks.length === 0 && group.label && (
								<div className="tt-empty-group">Drop tasks here</div>
							)}
						</div>
					);
				})}
				{doneTasks.length > 0 && (
					<div className="tt-group" style={{ marginTop: 12 }}>
						<div className="tt-group-head" onClick={() => toggleGroup("completed")}>
							<span className={`tt-caret ${collapsed.has("completed") ? "" : "is-open"}`}>
								<IconCaret />
							</span>
							Completed
							<span className="tt-group-count">{doneTasks.length}</span>
						</div>
						{!collapsed.has("completed") &&
							doneTasks
								.sort((a, b) => (b.updatedDate ?? "").localeCompare(a.updatedDate ?? ""))
								.map((task) => (
									<TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={onSelect} />
								))}
					</div>
				)}
			</div>
		</section>
	);
}

function EmptyState({ view }: { view: ViewSpec }) {
	const text =
		view.kind === "today"
			? "Nothing due today. Enjoy your day!"
			: view.kind === "inbox"
				? "Your inbox is empty. Add a task above or drop one here."
				: view.kind === "search"
					? "No matching tasks."
					: view.kind === "completed"
						? "No completed tasks yet."
						: "No tasks here yet.";
	return (
		<div style={{ textAlign: "center", color: "var(--tt-text-3)", padding: "64px 0" }}>
			<div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
			{text}
		</div>
	);
}
