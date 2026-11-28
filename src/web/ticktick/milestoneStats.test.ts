import { describe, expect, it } from "bun:test";
import type { Milestone, Task } from "../../types";
import { effectiveDue, loadByBucket, milestoneRows, presetPeriod, summarize } from "./milestoneStats";

const TODAY = "2026-11-26"; // a Thursday
const STATUSES = ["To Do", "In Progress", "Done"];
const PERIOD = { from: "2026-11-23", to: "2026-11-29" };
const context = { statuses: STATUSES, today: TODAY, period: PERIOD };

function task(id: string, fields: Partial<Task> = {}): Task {
	return {
		id,
		title: id,
		status: "To Do",
		assignee: [],
		createdDate: "2026-11-01 10:00",
		labels: [],
		dependencies: [],
		...fields,
	};
}
function milestone(id: string, title: string, fields: Partial<Milestone> = {}): Milestone {
	return { id, title, description: "", rawContent: "", ...fields };
}

const MILESTONES = [
	milestone("m-1", "Career"),
	milestone("m-2", "Classes", { parent: "m-1", dueDate: "2026-11-28" }),
	milestone("m-3", "Register", { parent: "m-2" }),
	milestone("m-4", "Solo", { dueDate: "2026-12-20" }),
];
const TASKS = [
	task("a", { milestone: "m-1", storyPoints: 3, dueDate: "2026-11-20" }), // overdue
	task("b", { milestone: "m-2", storyPoints: 5 }), // due with m-2 on the 28th
	task("c", { milestone: "m-3", storyPoints: 2, status: "Done" }),
	task("d", { milestone: "m-3" }), // unestimated, due with m-2
	task("e", { milestone: "m-4", storyPoints: 8 }), // due with m-4, after the period
];

describe("milestone rows", () => {
	const rows = milestoneRows(TASKS, MILESTONES, context);
	const byId = (id: string) => rows.find((row) => row.milestone.id === id);

	it("lists milestones parents first and builds paths", () => {
		expect(rows.map((row) => row.milestone.id)).toEqual(["m-4", "m-1", "m-2", "m-3"]);
		expect(byId("m-3")?.path).toBe("Career / Classes / Register");
	});
	it("rolls up tasks and points through child milestones", () => {
		expect(byId("m-1")).toMatchObject({ tasks: 4, doneTasks: 1, points: 10, donePoints: 2, openPoints: 8 });
		expect(byId("m-2")).toMatchObject({ tasks: 3, points: 7, openPoints: 5, unestimated: 1 });
		expect(byId("m-3")?.state).toBe("in-progress");
	});
	it("counts overdue, in-period and required points by deadline", () => {
		expect(byId("m-1")).toMatchObject({ overduePoints: 3, periodPoints: 5, requiredPoints: 8 });
		expect(byId("m-4")).toMatchObject({ periodPoints: 0, requiredPoints: 0 });
	});
	it("spans the bar from the first created day to the last deadline", () => {
		expect(byId("m-1")).toMatchObject({ start: "2026-11-01", end: "2026-11-28" });
	});
	it("summarizes shown rows without counting a task twice", () => {
		const summary = summarize(rows, TASKS, MILESTONES, context, 30);
		expect(summary).toMatchObject({ openPoints: 16, overduePoints: 3, periodPoints: 5, requiredPoints: 8 });
		expect(summary.capacity).toBeCloseTo((30 * 4) / 30.44, 1);
	});
	it("puts load into buckets, overdue in today's", () => {
		const load = loadByBucket(rows, TASKS, MILESTONES, STATUSES, TODAY, (day) => day.slice(0, 7));
		expect(load.get("2026-11")).toBe(8);
		expect(load.get("2026-12")).toBe(8);
	});
});

describe("deadlines and periods", () => {
	it("falls back to the nearest dated milestone", () => {
		expect(effectiveDue(task("x", { milestone: "m-3" }), MILESTONES)).toBe("2026-11-28");
		expect(effectiveDue(task("x", { milestone: "m-1" }), MILESTONES)).toBeNull();
	});
	it("knows the presets", () => {
		expect(presetPeriod("week", TODAY)).toEqual(PERIOD);
		expect(presetPeriod("month", TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
		expect(presetPeriod("quarter", TODAY)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
	});
});
