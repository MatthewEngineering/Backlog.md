import { describe, expect, it } from "bun:test";
import type { Milestone, Task } from "../../types";
import {
	addMonths,
	deriveMilestoneDependencies,
	eisenhowerQuadrant,
	monthGridDays,
	overCapacityMonths,
	startOfWeek,
	storedDateToDayKey,
	storyPointsByMonth,
	weekDays,
} from "./planning";

const makeTask = (overrides: Partial<Task>): Task => ({
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-11-02",
	...overrides,
});

describe("planning calendar days", () => {
	it("starts weeks on Monday, including across a month boundary", () => {
		expect(startOfWeek("2026-11-01")).toBe("2026-10-26");
		expect(weekDays("2026-11-21")).toEqual([
			"2026-11-16",
			"2026-11-17",
			"2026-11-18",
			"2026-11-19",
			"2026-11-20",
			"2026-11-21",
			"2026-11-22",
		]);
	});

	it("covers the whole month in six Monday-first weeks", () => {
		const days = monthGridDays("2026-02-15");
		expect(days).toHaveLength(42);
		expect(days[0]).toBe("2026-01-26");
		expect(days).toContain("2026-02-28");
	});

	it("moves between months from any day without overflowing short months", () => {
		expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
		expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
	});

	it("keeps date-only values on their day", () => {
		expect(storedDateToDayKey("2026-11-21")).toBe("2026-11-21");
		expect(storedDateToDayKey(undefined)).toBeNull();
		expect(storedDateToDayKey("not a date")).toBeNull();
	});
});

describe("eisenhowerQuadrant", () => {
	it("maps high, medium and low to their quadrants and everything else to no priority", () => {
		expect(eisenhowerQuadrant({ priority: "High" })).toBe("high");
		expect(eisenhowerQuadrant({ priority: "medium" })).toBe("medium");
		expect(eisenhowerQuadrant({ priority: "low" })).toBe("low");
		expect(eisenhowerQuadrant({ priority: undefined })).toBe("none");
		expect(eisenhowerQuadrant({ priority: "critical" })).toBe("none");
	});
});

const makeMilestone = (id: string, dueDate?: string): Milestone => ({
	id,
	title: id,
	dueDate,
	description: "",
	rawContent: "",
});

describe("deriveMilestoneDependencies", () => {
	it("links milestones through dependencies between their tasks, once per pair", () => {
		const tasks = [
			makeTask({ id: "task-1", milestone: "m-1" }),
			makeTask({ id: "task-2", milestone: "m-1" }),
			makeTask({ id: "task-3", milestone: "m-2", dependencies: ["task-1", "TASK-2"] }),
			makeTask({ id: "task-4", milestone: "m-2", dependencies: ["task-3"] }),
			makeTask({ id: "task-5", dependencies: ["task-1"] }),
		];
		expect(deriveMilestoneDependencies(tasks)).toEqual([{ from: "m-1", to: "m-2" }]);
	});
});

describe("storyPointsByMonth", () => {
	it("counts points in the due month, falling back to the milestone's due month", () => {
		const tasks = [
			makeTask({ id: "task-1", storyPoints: 5, dueDate: "2026-11-30" }),
			makeTask({ id: "task-2", storyPoints: 3, milestone: "m-1" }),
			makeTask({ id: "task-3", storyPoints: 2, milestone: "m-1", dueDate: "2026-12-02" }),
			makeTask({ id: "task-4", storyPoints: 8 }),
			makeTask({ id: "task-5" }),
		];
		const { byMonth, unscheduled } = storyPointsByMonth(tasks, [makeMilestone("m-1", "2026-11-15")]);
		expect(Object.fromEntries(byMonth)).toEqual({ "2026-11": 8, "2026-12": 2 });
		expect(unscheduled).toBe(8);
	});

	it("warns only for months above a configured capacity", () => {
		const byMonth = new Map([
			["2026-12", 21],
			["2026-11", 20],
		]);
		expect(overCapacityMonths(byMonth, 20)).toEqual(["2026-12"]);
		expect(overCapacityMonths(byMonth, undefined)).toEqual([]);
	});
});
