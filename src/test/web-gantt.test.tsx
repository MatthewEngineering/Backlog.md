import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { Milestone, Task } from "../types";
import GanttPage from "../web/components/GanttPage";

const makeTask = (overrides: Partial<Task>): Task => ({
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2030-01-01",
	...overrides,
});

const makeMilestone = (id: string, title: string, dueDate?: string): Milestone => ({
	id,
	title,
	dueDate,
	description: "",
	rawContent: "",
});

const renderGantt = (tasks: Task[], milestones: Milestone[], pointsPerMonth?: number): string =>
	renderToString(
		<MemoryRouter>
			<GanttPage tasks={tasks} statuses={["To Do", "Done"]} milestones={milestones} pointsPerMonth={pointsPerMonth} />
		</MemoryRouter>,
	);

describe("GanttPage", () => {
	const milestones = [makeMilestone("m-1", "Alpha", "2030-03-10"), makeMilestone("m-2", "Beta", "2030-04-20")];

	it("draws milestones as diamonds with a point rollup and no task rows", () => {
		const html = renderGantt(
			[
				makeTask({ id: "task-1", title: "Build parser", milestone: "m-1", storyPoints: 5, status: "Done" }),
				makeTask({ id: "task-2", title: "Write docs", milestone: "m-1", storyPoints: 3 }),
			],
			milestones,
		);
		expect(html).toContain('aria-label="Alpha, due 2030-03-10, 5/8 pts"');
		expect(html).toContain('aria-label="Beta, due 2030-04-20"');
		expect(html).not.toContain("Build parser");
	});

	it("links milestones through dependencies between their tasks and flags an impossible order", () => {
		const html = renderGantt(
			[
				makeTask({ id: "task-1", milestone: "m-2" }),
				makeTask({ id: "task-2", milestone: "m-1", dependencies: ["task-1"] }),
			],
			milestones,
		);
		// Alpha (due first) depends on Beta (due later), so the arrow is a conflict.
		expect(html).toContain("Alpha depends on Beta");
		expect(html).toContain("gantt-arrow-conflict");
	});

	it("warns about months planned above the team capacity", () => {
		const tasks = [
			makeTask({ id: "task-1", milestone: "m-1", storyPoints: 13 }),
			makeTask({ id: "task-2", dueDate: "2030-03-02", storyPoints: 8 }),
			makeTask({ id: "task-3", milestone: "m-2", storyPoints: 5 }),
		];
		// React separates interpolated text with comment markers; compare the visible text.
		const over = renderGantt(tasks, milestones, 20).replaceAll("<!-- -->", "");
		expect(over).toContain("Over capacity (20 pts/month):</span> Mar 2030 (21 pts)</div>");
		expect(renderGantt(tasks, milestones)).not.toContain("Over capacity");
	});
});
