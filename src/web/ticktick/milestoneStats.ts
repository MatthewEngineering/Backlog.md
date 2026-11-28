import { milestoneKey } from "../../core/milestones";
import type { Milestone, Task } from "../../types";
import {
	addDays,
	addMonths,
	type DayKey,
	daysBetween,
	dueDayKey,
	isTaskDone,
	startOfWeek,
	storedDateToDayKey,
} from "../utils/planning";
import { buildListTree, type ListNode } from "./model";

/**
 * Numbers behind the Milestones screen (list, board, Gantt). Every figure rolls up: a milestone
 * counts its own tasks and the tasks of every milestone nested under it.
 *
 * A task is "due" on its own due date, or, without one, on the due date of the nearest milestone
 * above it that has one (the milestone is its deadline).
 */

export interface Period {
	from: DayKey;
	to: DayKey;
}

export type MilestoneState = "empty" | "not-started" | "in-progress" | "done";

export interface MilestoneRow {
	milestone: Milestone;
	depth: number;
	parentId?: string;
	hasChildren: boolean;
	/** "Career / Spring classes" */
	path: string;
	/** The milestone's own due date. */
	due: DayKey | null;
	/** Bar on the Gantt: earliest task created/due day in the subtree to the latest due day. */
	start: DayKey | null;
	end: DayKey | null;
	tasks: number;
	/** Tasks filed directly in this milestone (not in one nested inside it). */
	ownTasks: number;
	doneTasks: number;
	points: number;
	donePoints: number;
	openPoints: number;
	/** Open points due before today. */
	overduePoints: number;
	/** Open points due inside the period. */
	periodPoints: number;
	/** Open points due on or before the period's last day (overdue included): what must be done by then. */
	requiredPoints: number;
	/** Open tasks without story points, which the point sums cannot see. */
	unestimated: number;
	state: MilestoneState;
	/** IDs of the tasks rolled up into this row. */
	taskIds: string[];
}

interface StatsContext {
	statuses: readonly string[];
	today: DayKey;
	period: Period;
}

/** Each task's deadline: its due date, else the nearest dated milestone above it. */
export function effectiveDue(task: Task, milestones: readonly Milestone[]): DayKey | null {
	const own = dueDayKey(task);
	if (own) return own;
	const byKey = new Map(milestones.map((milestone) => [milestoneKey(milestone.id), milestone]));
	const seen = new Set<string>();
	for (let cursor = byKey.get(milestoneKey(task.milestone)); cursor; ) {
		const key = milestoneKey(cursor.id);
		if (seen.has(key)) break;
		seen.add(key);
		const due = storedDateToDayKey(cursor.dueDate);
		if (due) return due;
		cursor = cursor.parent ? byKey.get(milestoneKey(cursor.parent)) : undefined;
	}
	return null;
}

/** Milestones in tree order (parents before children) with their rolled-up numbers. */
export function milestoneRows(
	tasks: readonly Task[],
	milestones: readonly Milestone[],
	{ statuses, today, period }: StatsContext,
): MilestoneRow[] {
	const own = new Map<string, Task[]>();
	for (const task of tasks) {
		const key = milestoneKey(task.milestone);
		if (!key) continue;
		own.set(key, [...(own.get(key) ?? []), task]);
	}
	const dueOf = new Map(tasks.map((task) => [task.id, effectiveDue(task, milestones)]));
	const rows: MilestoneRow[] = [];

	const visit = (node: ListNode, path: string[], parentId?: string): MilestoneRow => {
		const { milestone } = node;
		const names = [...path, milestone.title];
		const row: MilestoneRow = {
			milestone,
			depth: node.depth,
			parentId,
			hasChildren: node.children.length > 0,
			path: names.join(" / "),
			due: storedDateToDayKey(milestone.dueDate),
			start: null,
			end: null,
			tasks: 0,
			ownTasks: 0,
			doneTasks: 0,
			points: 0,
			donePoints: 0,
			openPoints: 0,
			overduePoints: 0,
			periodPoints: 0,
			requiredPoints: 0,
			unestimated: 0,
			state: "empty",
			taskIds: [],
		};
		rows.push(row);
		const earliest = (a: DayKey | null, b: DayKey | null) => (!a ? b : !b ? a : a < b ? a : b);
		const latest = (a: DayKey | null, b: DayKey | null) => (!a ? b : !b ? a : a > b ? a : b);
		row.end = row.due;

		for (const task of own.get(milestoneKey(milestone.id)) ?? []) {
			const points = task.storyPoints ?? 0;
			const done = isTaskDone(task, statuses);
			const due = dueOf.get(task.id) ?? null;
			row.taskIds.push(task.id);
			row.tasks += 1;
			row.ownTasks += 1;
			row.points += points;
			if (done) {
				row.doneTasks += 1;
				row.donePoints += points;
			} else {
				row.openPoints += points;
				if (!task.storyPoints) row.unestimated += 1;
				if (due && due < today) row.overduePoints += points;
				if (due && due >= period.from && due <= period.to) row.periodPoints += points;
				if (due && due <= period.to) row.requiredPoints += points;
			}
			row.start = earliest(row.start, earliest(storedDateToDayKey(task.createdDate), dueDayKey(task)));
			row.end = latest(row.end, dueDayKey(task));
		}
		for (const child of node.children) {
			const inner = visit(child, names, milestone.id);
			row.taskIds.push(...inner.taskIds);
			row.tasks += inner.tasks;
			row.doneTasks += inner.doneTasks;
			row.points += inner.points;
			row.donePoints += inner.donePoints;
			row.openPoints += inner.openPoints;
			row.overduePoints += inner.overduePoints;
			row.periodPoints += inner.periodPoints;
			row.requiredPoints += inner.requiredPoints;
			row.unestimated += inner.unestimated;
			row.start = earliest(row.start, inner.start);
			row.end = latest(row.end, inner.end);
		}
		if (row.start && row.end && row.start > row.end) row.start = row.end;
		if (!row.start) row.start = row.end;
		row.state =
			row.tasks === 0
				? "empty"
				: row.doneTasks === row.tasks
					? "done"
					: row.doneTasks === 0
						? "not-started"
						: "in-progress";
		return row;
	};
	for (const node of buildListTree(milestones)) visit(node, []);
	return rows;
}

export interface PeriodSummary {
	periodPoints: number;
	requiredPoints: number;
	overduePoints: number;
	openPoints: number;
	unestimated: number;
	/** Story points per month of capacity spread over the days left in the period, when configured. */
	capacity: number | null;
}

/**
 * Totals across the rows shown, counting each task once even when a milestone and the milestone
 * it sits in are both shown.
 */
export function summarize(
	rows: readonly MilestoneRow[],
	tasks: readonly Task[],
	milestones: readonly Milestone[],
	{ statuses, today, period }: StatsContext,
	pointsPerMonth?: number,
): PeriodSummary {
	const ids = new Set(rows.flatMap((row) => row.taskIds));
	const summary: PeriodSummary = {
		periodPoints: 0,
		requiredPoints: 0,
		overduePoints: 0,
		openPoints: 0,
		unestimated: 0,
		capacity: null,
	};
	for (const task of tasks) {
		if (!ids.has(task.id) || isTaskDone(task, statuses)) continue;
		const points = task.storyPoints ?? 0;
		const due = effectiveDue(task, milestones);
		summary.openPoints += points;
		if (!task.storyPoints) summary.unestimated += 1;
		if (due && due < today) summary.overduePoints += points;
		if (due && due >= period.from && due <= period.to) summary.periodPoints += points;
		if (due && due <= period.to) summary.requiredPoints += points;
	}
	if (pointsPerMonth && pointsPerMonth > 0) {
		const from = period.from > today ? period.from : today;
		const days = from > period.to ? 0 : daysBetween(from, period.to) + 1;
		summary.capacity = Math.round(((pointsPerMonth * days) / 30.44) * 10) / 10;
	}
	return summary;
}

/** Open points per bucket (week or month) of the timeline, by deadline. Overdue points sit in today's bucket. */
export function loadByBucket(
	rows: readonly MilestoneRow[],
	tasks: readonly Task[],
	milestones: readonly Milestone[],
	statuses: readonly string[],
	today: DayKey,
	bucketOf: (day: DayKey) => DayKey,
): Map<DayKey, number> {
	const ids = new Set(rows.flatMap((row) => row.taskIds));
	const load = new Map<DayKey, number>();
	for (const task of tasks) {
		if (!ids.has(task.id) || isTaskDone(task, statuses) || !task.storyPoints) continue;
		const due = effectiveDue(task, milestones);
		if (!due) continue;
		const bucket = bucketOf(due < today ? today : due);
		load.set(bucket, (load.get(bucket) ?? 0) + task.storyPoints);
	}
	return load;
}

export type PeriodPreset = "week" | "2weeks" | "month" | "nextmonth" | "quarter" | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
	week: "This week",
	"2weeks": "Next 2 weeks",
	month: "This month",
	nextmonth: "Next month",
	quarter: "This quarter",
	custom: "Custom",
};

/** The days a preset covers, counted from `today`. Weeks start on Monday. */
export function presetPeriod(preset: Exclude<PeriodPreset, "custom">, today: DayKey): Period {
	const monthStart = `${today.slice(0, 7)}-01`;
	switch (preset) {
		case "week": {
			const from = startOfWeek(today);
			return { from, to: addDays(from, 6) };
		}
		case "2weeks":
			return { from: today, to: addDays(today, 13) };
		case "month":
			return { from: monthStart, to: addDays(addMonths(monthStart, 1), -1) };
		case "nextmonth": {
			const from = addMonths(monthStart, 1);
			return { from, to: addDays(addMonths(from, 1), -1) };
		}
		case "quarter": {
			const month = Number(today.slice(5, 7));
			const first = `${today.slice(0, 4)}-${String(month - ((month - 1) % 3)).padStart(2, "0")}-01`;
			return { from: first, to: addDays(addMonths(first, 3), -1) };
		}
	}
}
