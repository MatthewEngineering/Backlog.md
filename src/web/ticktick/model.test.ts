import { describe, expect, it } from "bun:test";
import { milestoneArea, projectsWithoutFolders, rootMilestone } from "../../core/milestone-folders";
import type { Milestone, Task } from "../../types";
import {
	buildListTree,
	descendantMilestoneIds,
	groupByDate,
	milestonePath,
	nextSevenDayGroups,
	parseQuickAdd,
	priorityLevel,
	tasksForView,
} from "./model";

const TODAY = "2026-11-26"; // a Thursday
const STATUSES = ["To Do", "In Progress", "Done"];

function task(id: string, fields: Partial<Task> = {}): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "To Do",
		assignee: [],
		createdDate: "2026-11-01",
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
	milestone("m-2", "Spring classes", { parent: "m-1" }),
	milestone("m-3", "Register", { parent: "m-2" }),
	milestone("m-4", "Loop A", { parent: "m-5" }),
	milestone("m-5", "Loop B", { parent: "m-4" }),
	milestone("m-6", "Orphan", { parent: "m-99" }),
];

describe("smart lists", () => {
	const tasks = [
		task("1", { dueDate: "2026-11-20" }),
		task("2", { dueDate: TODAY }),
		task("3", { dueDate: "2026-12-02" }),
		task("4", { dueDate: "2026-12-03" }),
		task("5", { dueDate: TODAY, status: "Done" }),
		task("6", { milestone: "m-3" }),
		task("7", { milestone: "m-1", labels: ["Errand"], project: "Career" }),
	];
	const context = { statuses: STATUSES, today: TODAY, milestones: MILESTONES };
	const ids = (list: Task[]) => list.map((t) => t.id);

	it("Today holds open overdue and today tasks", () => {
		expect(ids(tasksForView(tasks, { kind: "today" }, context))).toEqual(["1", "2"]);
	});
	it("Next 7 Days runs through today + 6", () => {
		expect(ids(tasksForView(tasks, { kind: "next7" }, context))).toEqual(["1", "2", "3"]);
	});
	it("Inbox is tasks without a list", () => {
		expect(ids(tasksForView(tasks, { kind: "inbox" }, context))).toEqual(["1", "2", "3", "4", "5"]);
	});
	it("a list includes its nested lists", () => {
		expect(ids(tasksForView(tasks, { kind: "list", milestoneId: "m-1" }, context))).toEqual(["6", "7"]);
		expect(ids(tasksForView(tasks, { kind: "list", milestoneId: "m-3" }, context))).toEqual(["6"]);
	});
	it("tags match case-insensitively", () => {
		expect(ids(tasksForView(tasks, { kind: "tag", label: "errand" }, context))).toEqual(["7"]);
	});
});

describe("groupByDate", () => {
	it("orders TickTick's date sections and sorts by priority inside them", () => {
		const groups = groupByDate(
			[
				task("a"),
				task("b", { dueDate: "2027-01-10" }),
				task("c", { dueDate: "2026-11-29" }),
				task("d", { dueDate: "2026-11-27" }),
				task("e", { dueDate: TODAY, priority: "low" }),
				task("f", { dueDate: TODAY, priority: "critical" }),
				task("g", { dueDate: "2026-11-01" }),
			],
			TODAY,
		);
		expect(groups.map((g) => g.label)).toEqual(["Overdue", "Today", "Tomorrow", "Next 7 Days", "Later", "No Date"]);
		expect(groups[1]?.tasks.map((t) => t.id)).toEqual(["f", "e"]);
	});

	it("Next 7 Days shows all seven days, empty ones too", () => {
		const groups = nextSevenDayGroups([task("x", { dueDate: "2026-11-28" })], TODAY);
		expect(groups).toHaveLength(7);
		expect(groups[0]?.label).toBe("Today");
		expect(groups[2]?.tasks.map((t) => t.id)).toEqual(["x"]);
		expect(groups[2]?.day).toBe("2026-11-28");
	});
});

describe("nested lists", () => {
	it("nests by parent and puts broken parents and cycles at the top level", () => {
		const tree = buildListTree(MILESTONES);
		const career = tree.find((node) => node.milestone.id === "m-1");
		expect(career?.children[0]?.milestone.id).toBe("m-2");
		expect(career?.children[0]?.children[0]?.milestone.id).toBe("m-3");
		expect(tree.map((node) => node.milestone.id).sort()).toEqual(["m-1", "m-4", "m-5", "m-6"]);
	});
	it("collects descendants and builds paths", () => {
		expect(descendantMilestoneIds("m-1", MILESTONES)).toEqual(["m-1", "m-2", "m-3"]);
		expect(milestonePath("m-3", MILESTONES)).toBe("Career / Spring classes / Register");
	});
	it("reads a milestone's area from its body, else its tasks", () => {
		const projects = ["Money", "Career"];
		expect(
			milestoneArea(milestone("m-9", "x", { rawContent: "## Description\n\n- Area:: money\n" }), [], projects),
		).toBe("Money");
		expect(milestoneArea(milestone("m-9", "x"), [task("1", { milestone: "m-9", project: "Career" })], projects)).toBe(
			"Career",
		);
	});
	it("finds a list's folder and the projects that have none yet", () => {
		expect(rootMilestone("m-3", MILESTONES)?.id).toBe("m-1");
		expect(rootMilestone("m-1", MILESTONES)?.id).toBe("m-1");
		expect(projectsWithoutFolders(["career", "Money"], MILESTONES)).toEqual(["Money"]);
	});
});

describe("parseQuickAdd", () => {
	const context = {
		today: TODAY,
		milestones: MILESTONES,
		priorities: ["critical", "high", "medium", "low"],
	};
	it("reads markers and dates out of the title", () => {
		expect(parseQuickAdd("Pay rent tomorrow !high #bills @spring-classes", context)).toEqual({
			title: "Pay rent",
			dueDate: "2026-11-27",
			priority: "high",
			labels: ["bills"],
			milestone: "m-2",
		});
	});
	it("understands weekdays, month days and relative days", () => {
		expect(parseQuickAdd("Gym mon", context).dueDate).toBe("2026-11-30");
		expect(parseQuickAdd("Gym thursday", context).dueDate).toBe("2026-12-03");
		expect(parseQuickAdd("Taxes dec 3", context).dueDate).toBe("2026-12-03");
		expect(parseQuickAdd("Taxes 15 jan", context).dueDate).toBe("2027-01-15");
		expect(parseQuickAdd("Call in 3 days", context).dueDate).toBe("2026-11-29");
		expect(parseQuickAdd("Stretch !2 ~career", context)).toMatchObject({ priority: "medium", milestone: "m-1" });
	});
	it("leaves look-alikes in the title", () => {
		expect(parseQuickAdd("Buy 2 mars bars", context)).toEqual({ title: "Buy 2 mars bars", labels: [] });
		expect(parseQuickAdd("Email bob@example.com ~nope", context).title).toBe("Email bob@example.com ~nope");
	});
});

describe("priorityLevel", () => {
	it("flies critical as high", () => {
		expect(priorityLevel({ priority: "critical" })).toBe("high");
		expect(priorityLevel({ priority: "weird" })).toBe("none");
	});
});
