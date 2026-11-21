import { milestoneKey } from "../../core/milestones";
import type { Milestone, Task } from "../../types";
import { normalizePriorityValue } from "../../utils/priority-config";
import { isTerminalStatus } from "../../utils/terminal-status";
import { parseStoredUtcDate } from "../../utils/utc-timestamp";

/**
 * Shared rules for the planning views (calendar, week, Eisenhower, Gantt).
 *
 * Every day is handled as a `YYYY-MM-DD` key in the viewer's local calendar. Day arithmetic runs on
 * UTC midnights so daylight-saving changes can never skip or repeat a day.
 */

export type DayKey = string;

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number, length = 2): string {
	return String(value).padStart(length, "0");
}

/** The local calendar day an instant falls on. */
export function localDayKey(date: Date): DayKey {
	return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayKeyToUtcMs(key: DayKey): number {
	const match = key.match(DAY_KEY_PATTERN);
	if (!match) throw new Error(`Invalid day key: ${key}`);
	return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function utcMsToDayKey(ms: number): DayKey {
	const date = new Date(ms);
	return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(key: DayKey, days: number): DayKey {
	return utcMsToDayKey(dayKeyToUtcMs(key) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DayKey, to: DayKey): number {
	return Math.round((dayKeyToUtcMs(to) - dayKeyToUtcMs(from)) / DAY_MS);
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: DayKey): DayKey {
	const weekday = new Date(dayKeyToUtcMs(key)).getUTCDay();
	return addDays(key, -((weekday + 6) % 7));
}

export function weekDays(key: DayKey): DayKey[] {
	const monday = startOfWeek(key);
	return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Six full Monday-first weeks covering the month that contains `key`. */
export function monthGridDays(key: DayKey): DayKey[] {
	const firstOfMonth = `${key.slice(0, 7)}-01`;
	const gridStart = startOfWeek(firstOfMonth);
	return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function addMonths(key: DayKey, months: number): DayKey {
	const date = new Date(dayKeyToUtcMs(`${key.slice(0, 7)}-01`));
	date.setUTCMonth(date.getUTCMonth() + months);
	return utcMsToDayKey(date.getTime());
}

/** A day key rendered for people, e.g. "Mon 24 Nov" or "November 2026". */
export function formatDay(key: DayKey, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(dayKeyToUtcMs(key)));
}

/**
 * The local day a stored task date names. Date-only values (due dates) already name a day and are
 * returned unchanged; timestamps (created/updated, stored in UTC) are converted to the viewer's day.
 */
export function storedDateToDayKey(value: string | undefined): DayKey | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const dateOnly = trimmed.slice(0, 10);
	if (trimmed.length === 10 && DAY_KEY_PATTERN.test(dateOnly)) return dateOnly;
	const parsed = parseStoredUtcDate(trimmed);
	return parsed ? localDayKey(parsed) : null;
}

export function dueDayKey(task: Task): DayKey | null {
	return storedDateToDayKey(task.dueDate);
}

/** Tasks grouped by due day; tasks without a due date are left out. */
export function groupTasksByDueDay(tasks: readonly Task[]): Map<DayKey, Task[]> {
	const byDay = new Map<DayKey, Task[]>();
	for (const task of tasks) {
		const day = dueDayKey(task);
		if (!day) continue;
		const list = byDay.get(day);
		if (list) list.push(task);
		else byDay.set(day, [task]);
	}
	return byDay;
}

export type EisenhowerQuadrant = "high" | "medium" | "low" | "none";

/**
 * Quadrants in reading order: high and medium across the top, low and no priority across the
 * bottom. A priority outside high/medium/low (a custom configured value) counts as no priority.
 */
export const EISENHOWER_QUADRANTS: readonly { key: EisenhowerQuadrant; label: string }[] = [
	{ key: "high", label: "High" },
	{ key: "medium", label: "Medium" },
	{ key: "low", label: "Low" },
	{ key: "none", label: "No priority" },
];

export function eisenhowerQuadrant(task: Pick<Task, "priority">): EisenhowerQuadrant {
	const priority = normalizePriorityValue(task.priority);
	return priority === "high" || priority === "medium" || priority === "low" ? priority : "none";
}

export function groupTasksByQuadrant(tasks: readonly Task[]): Record<EisenhowerQuadrant, Task[]> {
	const groups: Record<EisenhowerQuadrant, Task[]> = { high: [], medium: [], low: [], none: [] };
	for (const task of tasks) groups[eisenhowerQuadrant(task)].push(task);
	return groups;
}

export function isTaskDone(task: Task, statuses: readonly string[]): boolean {
	return isTerminalStatus(task.status, statuses);
}

/**
 * Milestone dependencies, derived from the tasks inside them: milestone A depends on milestone B
 * when a task in A depends on a task in B. Milestones are compared by `milestoneKey`, so the task's
 * milestone value and the milestone ID match regardless of case. Returned once per pair.
 */
export function deriveMilestoneDependencies(tasks: readonly Task[]): { from: string; to: string }[] {
	const milestoneOfTask = new Map<string, string>();
	for (const task of tasks) {
		const key = milestoneKey(task.milestone);
		if (key) milestoneOfTask.set(task.id.toLowerCase(), key);
	}
	const edges = new Map<string, { from: string; to: string }>();
	for (const task of tasks) {
		const dependent = milestoneKey(task.milestone);
		if (!dependent) continue;
		for (const dependencyId of task.dependencies ?? []) {
			const prerequisite = milestoneOfTask.get(dependencyId.toLowerCase());
			if (!prerequisite || prerequisite === dependent) continue;
			edges.set(`${prerequisite}\u0000${dependent}`, { from: prerequisite, to: dependent });
		}
	}
	return [...edges.values()];
}

export type MonthKey = string;

/**
 * Story points per calendar month (`YYYY-MM`). A task counts in the month of its due date, or of
 * its milestone's due date when it has none; tasks with neither are reported as unscheduled.
 */
export function storyPointsByMonth(
	tasks: readonly Task[],
	milestones: readonly Milestone[],
): { byMonth: Map<MonthKey, number>; unscheduled: number } {
	const milestoneDue = new Map<string, DayKey>();
	for (const milestone of milestones) {
		const due = storedDateToDayKey(milestone.dueDate);
		if (due) milestoneDue.set(milestoneKey(milestone.id), due);
	}
	const byMonth = new Map<MonthKey, number>();
	let unscheduled = 0;
	for (const task of tasks) {
		const points = task.storyPoints ?? 0;
		if (points <= 0) continue;
		const day = dueDayKey(task) ?? milestoneDue.get(milestoneKey(task.milestone));
		if (!day) {
			unscheduled += points;
			continue;
		}
		const month = day.slice(0, 7);
		byMonth.set(month, (byMonth.get(month) ?? 0) + points);
	}
	return { byMonth, unscheduled };
}

/** Months whose points exceed the team's monthly capacity, in order. No capacity means no warnings. */
export function overCapacityMonths(
	byMonth: ReadonlyMap<MonthKey, number>,
	pointsPerMonth: number | undefined,
): MonthKey[] {
	if (!pointsPerMonth || pointsPerMonth <= 0) return [];
	return [...byMonth.entries()]
		.filter(([, points]) => points > pointsPerMonth)
		.map(([month]) => month)
		.sort();
}
