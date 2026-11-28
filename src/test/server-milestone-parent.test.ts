import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { BacklogServer } from "../server/index.ts";
import type { Milestone } from "../types/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let testDir: string;
let server: BacklogServer | null = null;
let base = "";

beforeEach(async () => {
	testDir = createUniqueTestDir("server-milestone-parent");
	await mkdir(testDir, { recursive: true });
	const core = new Core(testDir);
	await core.filesystem.ensureBacklogStructure();
	await core.filesystem.saveConfig({
		projectName: "Nested milestones",
		statuses: ["To Do", "Done"],
		labels: [],
		milestones: [],
		projects: ["Money", "Career"],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		checkActiveBranches: false,
		autoCommit: false,
	});
	server = new BacklogServer(testDir);
	await server.start(0, false);
	base = `http://127.0.0.1:${server.getPort() ?? 0}/api`;
	await retry(async () => {
		if (!(await fetch(`${base}/status`)).ok) throw new Error("Server is not ready");
	});
});

afterEach(async () => {
	await server?.stop();
	server = null;
	await safeCleanup(testDir);
});

const create = async (body: object) =>
	fetch(`${base}/milestones`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

const setParent = async (id: string, parent: string | null) =>
	fetch(`${base}/milestones/${id}/parent`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ parent }),
	});

const list = async () => (await (await fetch(`${base}/milestones`)).json()) as Milestone[];

describe("nested milestones", () => {
	it("creates a milestone inside another and keeps the parent through a rename", async () => {
		const outer = (await (await create({ title: "Career" })).json()) as Milestone;
		const inner = (await (await create({ title: "Classes", parent: "Career" })).json()) as Milestone;
		expect(inner.parent).toBe(outer.id);

		const rename = await fetch(`${base}/milestones/${inner.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Spring classes" }),
		});
		expect(rename.status).toBe(200);
		const renamed = (await list()).find((milestone) => milestone.id === inner.id);
		expect(renamed?.title).toBe("Spring classes");
		expect(renamed?.parent).toBe(outer.id);
	});

	it("moves a milestone under another, refuses cycles, and moves it back to the top", async () => {
		const a = (await (await create({ title: "A" })).json()) as Milestone;
		const b = (await (await create({ title: "B" })).json()) as Milestone;

		expect((await setParent(b.id, a.id)).status).toBe(200);
		expect((await list()).find((milestone) => milestone.id === b.id)?.parent).toBe(a.id);

		const cycle = await setParent(a.id, b.id);
		expect(cycle.status).toBe(400);
		expect(((await cycle.json()) as { error: string }).error).toContain("cannot be nested");
		expect((await setParent(a.id, a.id)).status).toBe(400);

		expect((await setParent(b.id, null)).status).toBe(200);
		expect((await list()).find((milestone) => milestone.id === b.id)?.parent).toBeUndefined();
	});

	it("rejects an unknown parent", async () => {
		expect((await create({ title: "Orphan", parent: "m-404" })).status).toBe(400);
		const a = (await (await create({ title: "A" })).json()) as Milestone;
		expect((await setParent(a.id, "m-404")).status).toBe(400);
	});
});

describe("projects into folders", () => {
	it("makes a folder per project, nests that area's lists and moves project off tasks", async () => {
		const bills = (await (await create({ title: "Bills", description: "- Area:: Money" })).json()) as Milestone;
		const post = async (body: object) =>
			(await (
				await fetch(`${base}/tasks`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				})
			).json()) as { id: string };
		const loose = await post({ title: "Pay rent", project: "Money" });
		const inList = await post({ title: "Water bill", project: "Money", milestone: bills.id });
		const mismatch = await post({ title: "Résumé", project: "Career", milestone: bills.id });

		const response = await fetch(`${base}/milestones/folders-from-projects`, { method: "POST" });
		if (response.status !== 200) throw new Error(await response.text());
		const result = (await response.json()) as { createdFolders: string[]; nestedMilestones: string[] };
		expect(result.createdFolders).toHaveLength(2);
		expect(result.nestedMilestones).toEqual([bills.id]);

		const milestones = await list();
		const money = milestones.find((milestone) => milestone.title === "Money");
		expect(milestones.find((milestone) => milestone.id === bills.id)?.parent).toBe(money?.id);

		const fetchTask = async (id: string) =>
			(await (await fetch(`${base}/task/${id}`)).json()) as { milestone?: string; project?: string };
		expect(await fetchTask(loose.id)).toMatchObject({ milestone: money?.id });
		expect((await fetchTask(loose.id)).project).toBeUndefined();
		expect((await fetchTask(inList.id)).project).toBeUndefined();
		expect((await fetchTask(mismatch.id)).project).toBe("Career");

		// Running it again finds the folders and changes nothing.
		const again = (await (await fetch(`${base}/milestones/folders-from-projects`, { method: "POST" })).json()) as {
			createdFolders: string[];
			updatedTasks: string[];
		};
		expect(again.createdFolders).toEqual([]);
		expect(again.updatedTasks).toEqual([]);
	});
});
