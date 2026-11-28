import { milestoneKey } from "../../core/milestones";
import type { Milestone, Task } from "../../types";
import { normalizePriorityValue } from "../../utils/priority-config";
import { addDays, type DayKey, dueDayKey, formatDay, isTaskDone, localDayKey } from "../utils/planning";

/**
 * Rules behind the TickTick-style task app (`/app`): which tasks each smart list shows, how a list
 * groups them by date, how milestones nest into lists, and how the quick-add line is read.
 * Components stay presentational; everything they decide comes from here.
 */

export type PriorityLevel = "high" | "medium" | "low" | "none";

/** Backlog priorities on TickTick's four flags. `critical` (a configured extra) flies the high flag. */
export function priorityLevel(task: Pick<Task, "priority">): PriorityLevel {
	const value = normalizePriorityValue(task.priority);
	if (value === "critical" || value === "high") return "high";
	if (value === "medium" || value === "low") return value;
	return "none";
}

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function priorityRank(task: Task): number {
	return PRIORITY_RANK[normalizePriorityValue(task.priority) ?? ""] ?? 4;
}

/** TickTick's default order: priority, then due date (undated last), then board order, then ID. */
export function compareTasks(a: Task, b: Task): number {
	const byPriority = priorityRank(a) - priorityRank(b);
	if (byPriority !== 0) return byPriority;
	const aDue = dueDayKey(a);
	const bDue = dueDayKey(b);
	if (aDue !== bDue) {
		if (!aDue) return 1;
		if (!bDue) return -1;
		return aDue < bDue ? -1 : 1;
	}
	const byOrdinal = (a.ordinal ?? Number.MAX_SAFE_INTEGER) - (b.ordinal ?? Number.MAX_SAFE_INTEGER);
	if (byOrdinal !== 0) return byOrdinal;
	return a.id.localeCompare(b.id, undefined, { numeric: true });
}

export function todayKey(now: Date = new Date()): DayKey {
	return localDayKey(now);
}

// ---------------------------------------------------------------------------------------------
// Views

/** Where the main column is pointed. Smart lists are fixed; the rest name a list (or folder) or tag. */
export type ViewSpec =
	| { kind: "today" }
	| { kind: "next7" }
	| { kind: "inbox" }
	| { kind: "all" }
	| { kind: "completed" }
	| { kind: "list"; milestoneId: string }
	| { kind: "tag"; label: string }
	| { kind: "search"; query: string };

export interface ViewContext {
	statuses: readonly string[];
	today: DayKey;
	milestones: readonly Milestone[];
}

/**
 * The tasks a view shows. Today, Next 7 Days and All show open tasks; Inbox, a list, a tag and a
 * search show open and done tasks so the caller can fold the done ones into "Completed".
 * A list includes the tasks of the lists nested under it.
 */
export function tasksForView(tasks: readonly Task[], view: ViewSpec, context: ViewContext): Task[] {
	const { statuses, today } = context;
	const open = (task: Task) => !isTaskDone(task, statuses);
	switch (view.kind) {
		case "today":
			return tasks.filter((task) => open(task) && isDueBy(task, today));
		case "next7":
			return tasks.filter((task) => open(task) && isDueBy(task, addDays(today, 6)));
		case "inbox":
			return tasks.filter((task) => !milestoneKey(task.milestone));
		case "all":
			return tasks.filter(open);
		case "completed":
			return tasks.filter((task) => !open(task));
		case "list": {
			const keys = new Set(descendantMilestoneIds(view.milestoneId, context.milestones).map(milestoneKey));
			return tasks.filter((task) => keys.has(milestoneKey(task.milestone)));
		}
		case "tag":
			return tasks.filter((task) => task.labels.some((label) => label.toLowerCase() === view.label.toLowerCase()));
		case "search": {
			const query = view.query.trim().toLowerCase();
			if (!query) return [];
			return tasks.filter((task) =>
				[task.id, task.title, task.description ?? "", ...task.labels].some((text) =>
					text.toLowerCase().includes(query),
				),
			);
		}
	}
}

function isDueBy(task: Task, day: DayKey): boolean {
	const due = dueDayKey(task);
	return due !== null && due <= day;
}

export interface TaskGroup {
	key: string;
	label: string;
	tasks: Task[];
	/** Tone for the header: overdue is red in TickTick. */
	tone?: "overdue";
	/** Due day new tasks added under this group get, when it names one. */
	day?: DayKey;
}

/**
 * TickTick's date sections for a list: Overdue, Today, Tomorrow, Next 7 Days, Later, No Date.
 * `byDay` instead gives each of the next seven days its own section (the "Next 7 Days" list).
 * Empty sections are dropped. Tasks inside each section are in `compareTasks` order.
 */
export function groupByDate(tasks: readonly Task[], today: DayKey, byDay = false): TaskGroup[] {
	const tomorrow = addDays(today, 1);
	const weekEnd = addDays(today, 6);
	const groups = new Map<string, TaskGroup>();
	const order: string[] = [];
	const add = (key: string, make: () => Omit<TaskGroup, "tasks" | "key">, task: Task) => {
		let group = groups.get(key);
		if (!group) {
			group = { key, tasks: [], ...make() };
			groups.set(key, group);
			order.push(key);
		}
		group.tasks.push(task);
	};
	for (const task of tasks) {
		const due = dueDayKey(task);
		if (!due) add("nodate", () => ({ label: "No Date" }), task);
		else if (due < today) add("overdue", () => ({ label: "Overdue", tone: "overdue" }), task);
		else if (due === today) add("today", () => ({ label: "Today", day: today }), task);
		else if (due === tomorrow) add("tomorrow", () => ({ label: "Tomorrow", day: tomorrow }), task);
		else if (due <= weekEnd && byDay)
			add(due, () => ({ label: formatDay(due, { weekday: "long", month: "short", day: "numeric" }), day: due }), task);
		else if (due <= weekEnd) add("week", () => ({ label: "Next 7 Days" }), task);
		else add("later", () => ({ label: "Later" }), task);
	}
	const rank = (key: string) => {
		const fixed = ["overdue", "today", "tomorrow"].indexOf(key);
		if (fixed >= 0) return `0${fixed}`;
		if (/^\d{4}-/.test(key)) return `1${key}`;
		return `2${["week", "later", "nodate"].indexOf(key)}`;
	};
	return order
		.sort((a, b) => (rank(a) < rank(b) ? -1 : 1))
		.map((key) => {
			const group = groups.get(key) as TaskGroup;
			return { ...group, tasks: [...group.tasks].sort(compareTasks) };
		});
}

/** Groups for the "Next 7 Days" list always show all seven days, even empty ones, like TickTick. */
export function nextSevenDayGroups(tasks: readonly Task[], today: DayKey): TaskGroup[] {
	const byDue = groupByDate(tasks, today, true);
	const overdue = byDue.find((group) => group.key === "overdue");
	const days: TaskGroup[] = Array.from({ length: 7 }, (_, index) => {
		const day = addDays(today, index);
		const key = index === 0 ? "today" : index === 1 ? "tomorrow" : day;
		const label =
			index === 0
				? "Today"
				: index === 1
					? "Tomorrow"
					: formatDay(day, { weekday: "long", month: "short", day: "numeric" });
		return { key, label, day, tasks: byDue.find((group) => group.key === key)?.tasks ?? [] };
	});
	return overdue ? [overdue, ...days] : days;
}

// ---------------------------------------------------------------------------------------------
// Nested lists

export interface ListNode {
	milestone: Milestone;
	children: ListNode[];
	depth: number;
}

/**
 * Milestones as a forest by their `parent`. A parent that is missing (archived, typo) or that
 * would form a cycle leaves the milestone at the top level. Siblings sort by due date, then title.
 */
export function buildListTree(milestones: readonly Milestone[]): ListNode[] {
	const byKey = new Map(milestones.map((milestone) => [milestoneKey(milestone.id), milestone]));
	const parentOf = (milestone: Milestone): Milestone | undefined => {
		const parent = milestone.parent ? byKey.get(milestoneKey(milestone.parent)) : undefined;
		if (!parent) return undefined;
		// Walk up from the parent; reaching the milestone again means a cycle.
		const seen = new Set<string>([milestoneKey(milestone.id)]);
		for (let cursor: Milestone | undefined = parent; cursor; ) {
			const key = milestoneKey(cursor.id);
			if (seen.has(key)) return undefined;
			seen.add(key);
			cursor = cursor.parent ? byKey.get(milestoneKey(cursor.parent)) : undefined;
		}
		return parent;
	};
	const childrenOf = new Map<string, Milestone[]>();
	const roots: Milestone[] = [];
	for (const milestone of milestones) {
		const parent = parentOf(milestone);
		if (!parent) roots.push(milestone);
		else {
			const key = milestoneKey(parent.id);
			childrenOf.set(key, [...(childrenOf.get(key) ?? []), milestone]);
		}
	}
	const sortMilestones = (list: Milestone[]) =>
		[...list].sort((a, b) => {
			if (a.dueDate !== b.dueDate) {
				if (!a.dueDate) return 1;
				if (!b.dueDate) return -1;
				return a.dueDate < b.dueDate ? -1 : 1;
			}
			return a.title.localeCompare(b.title);
		});
	const build = (milestone: Milestone, depth: number): ListNode => ({
		milestone,
		depth,
		children: sortMilestones(childrenOf.get(milestoneKey(milestone.id)) ?? []).map((child) => build(child, depth + 1)),
	});
	return sortMilestones(roots).map((milestone) => build(milestone, 0));
}

/** The milestone and every milestone nested under it, by ID. */
export function descendantMilestoneIds(milestoneId: string, milestones: readonly Milestone[]): string[] {
	const find = (nodes: ListNode[]): ListNode | undefined => {
		for (const node of nodes) {
			if (milestoneKey(node.milestone.id) === milestoneKey(milestoneId)) return node;
			const inner = find(node.children);
			if (inner) return inner;
		}
		return undefined;
	};
	const node = find(buildListTree(milestones));
	if (!node) return [milestoneId];
	const ids: string[] = [];
	const walk = (current: ListNode) => {
		ids.push(current.milestone.id);
		for (const child of current.children) walk(child);
	};
	walk(node);
	return ids;
}

/** The list path, e.g. "Career / Spring classes", for a task's milestone. */
export function milestonePath(milestoneId: string | undefined, milestones: readonly Milestone[]): string {
	if (!milestoneId) return "";
	const byKey = new Map(milestones.map((milestone) => [milestoneKey(milestone.id), milestone]));
	const parts: string[] = [];
	const seen = new Set<string>();
	for (let cursor = byKey.get(milestoneKey(milestoneId)); cursor; ) {
		const key = milestoneKey(cursor.id);
		if (seen.has(key)) break;
		seen.add(key);
		parts.unshift(cursor.title);
		cursor = cursor.parent ? byKey.get(milestoneKey(cursor.parent)) : undefined;
	}
	return parts.join(" / ") || milestoneId;
}

// ---------------------------------------------------------------------------------------------
// Quick add

export interface QuickAddContext {
	today: DayKey;
	milestones: readonly Milestone[];
	priorities: readonly string[];
}

export interface QuickAddResult {
	title: string;
	dueDate?: DayKey;
	priority?: string;
	labels: string[];
	milestone?: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAME =
	"(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)";

function monthIndex(name: string): number {
	return MONTHS.indexOf(name.toLowerCase().slice(0, 3));
}

function compact(value: string): string {
	return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/** The next date (after today) that falls on `weekday` (0 = Sunday). */
function nextWeekday(today: DayKey, weekday: number): DayKey {
	const current = new Date(`${today}T00:00:00Z`).getUTCDay();
	const ahead = (weekday - current + 7) % 7 || 7;
	return addDays(today, ahead);
}

function monthDay(today: DayKey, month: number, day: number): DayKey | undefined {
	if (day < 1 || day > 31) return undefined;
	const year = Number(today.slice(0, 4));
	const candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	// A date earlier this year means next year's, like TickTick.
	return candidate < today ? `${year + 1}${candidate.slice(4)}` : candidate;
}

/**
 * Read TickTick-style smart syntax out of a quick-add line:
 * - dates: `today`, `tod`, `tomorrow`, `tmr`, `next week`, `mon`..`sunday`, `in 3 days`,
 *   `2026-12-01`, `dec 3`, `3 dec`
 * - `!high` / `!1` (high) `!2` (medium) `!3` (low), or any configured priority by name
 * - `#tag` for labels, `~List` (or `@List`) for a milestone or folder (title or ID, spaces as `-`)
 * Unrecognised markers stay in the title.
 */
export function parseQuickAdd(input: string, context: QuickAddContext): QuickAddResult {
	const result: QuickAddResult = { title: "", labels: [] };
	let text = ` ${input.trim()} `;
	const take = (pattern: RegExp, apply: (match: RegExpMatchArray) => boolean) => {
		const match = text.match(pattern);
		if (match && apply(match)) text = text.replace(match[0], " ");
	};

	// Tokens with markers.
	for (const match of [...text.matchAll(/\s#([^\s#]+)/g)]) {
		result.labels.push(match[1] as string);
		text = text.replace(match[0], " ");
	}
	take(/\s[~@](\S+)/, (match) => {
		const wanted = compact(match[1] as string);
		const milestone = context.milestones.find(
			(candidate) => compact(candidate.id) === wanted || compact(candidate.title) === wanted,
		);
		if (!milestone) return false;
		result.milestone = milestone.id;
		return true;
	});
	take(/\s!(\S+)/, (match) => {
		const raw = (match[1] as string).toLowerCase();
		const byNumber: Record<string, string> = { "1": "high", "2": "medium", "3": "low" };
		const wanted = byNumber[raw] ?? raw;
		const priority = context.priorities.find((candidate) => candidate.toLowerCase() === wanted);
		if (!priority) return false;
		result.priority = priority;
		return true;
	});

	// Dates, most specific first.
	const { today } = context;
	const datePatterns: Array<[RegExp, (match: RegExpMatchArray) => DayKey | undefined]> = [
		[/\s(\d{4}-\d{2}-\d{2})(?=\s)/i, (match) => match[1]],
		[/\sin (\d{1,3}) days?(?=\s)/i, (match) => addDays(today, Number(match[1]))],
		[/\sin (\d{1,2}) weeks?(?=\s)/i, (match) => addDays(today, Number(match[1]) * 7)],
		[/\s(today|tod)(?=\s)/i, () => today],
		[/\s(tomorrow|tmr|tmrw)(?=\s)/i, () => addDays(today, 1)],
		[/\snext week(?=\s)/i, () => nextWeekday(today, 1)],
		[
			/\s(?:on |next )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday|rsday)?(?=\s)/i,
			(match) => {
				const index = WEEKDAYS.findIndex((day) => day.startsWith((match[1] as string).toLowerCase().slice(0, 3)));
				return index >= 0 ? nextWeekday(today, index) : undefined;
			},
		],
		[
			new RegExp(`\\s${MONTH_NAME}\\.? (\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, "i"),
			(match) => {
				const month = monthIndex(match[1] as string);
				return month >= 0 ? monthDay(today, month, Number(match[2])) : undefined;
			},
		],
		[
			new RegExp(`\\s(\\d{1,2})(?:st|nd|rd|th)? ${MONTH_NAME}\\.?(?=\\s)`, "i"),
			(match) => {
				const month = monthIndex(match[2] as string);
				return month >= 0 ? monthDay(today, month, Number(match[1])) : undefined;
			},
		],
	];
	for (const [pattern, resolve] of datePatterns) {
		const match = text.match(pattern);
		const day = match ? resolve(match) : undefined;
		if (match && day) {
			result.dueDate = day;
			text = text.replace(match[0], " ");
			break;
		}
	}

	result.title = text.replace(/\s+/g, " ").trim();
	return result;
}

/** "Today", "Tomorrow", "Yesterday", a weekday within the week, else "Dec 3" (with year if not this year). */
export function relativeDayLabel(day: DayKey, today: DayKey): string {
	if (day === today) return "Today";
	if (day === addDays(today, 1)) return "Tomorrow";
	if (day === addDays(today, -1)) return "Yesterday";
	if (day > today && day <= addDays(today, 6)) return formatDay(day, { weekday: "long" });
	if (day.slice(0, 4) !== today.slice(0, 4)) return formatDay(day, { month: "short", day: "numeric", year: "numeric" });
	return formatDay(day, { month: "short", day: "numeric" });
}
