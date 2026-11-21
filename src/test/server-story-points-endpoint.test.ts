import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import type { BacklogConfig, Task } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

type StoryPointServerHandlers = {
	handleCreateTask(request: Request): Promise<Response>;
	handleUpdateTask(request: Request, taskId: string): Promise<Response>;
	handleUpdateConfig(request: Request): Promise<Response>;
};

describe("BacklogServer story points", () => {
	let testDir: string;
	let server: BacklogServer | null;
	let handlers: StoryPointServerHandlers;
	let filesystem: FileSystem;

	beforeEach(async () => {
		testDir = createUniqueTestDir("server-story-points");
		await mkdir(testDir, { recursive: true });
		await $`git init -b main`.cwd(testDir).quiet();
		filesystem = new FileSystem(testDir);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Server story points",
			statuses: ["To Do", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			checkActiveBranches: false,
			autoCommit: false,
		});
		server = new BacklogServer(testDir);
		handlers = server as unknown as StoryPointServerHandlers;
	});

	afterEach(async () => {
		await server?.stop();
		server = null;
		await safeCleanup(testDir);
	});

	const jsonRequest = (path: string, method: string, body: unknown) =>
		new Request(`http://localhost${path}`, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

	it("sets, rejects, and clears task story points", async () => {
		const created = await handlers.handleCreateTask(
			jsonRequest("/api/tasks", "POST", { title: "Sized", storyPoints: 3 }),
		);
		expect(created.status).toBe(201);
		const task = (await created.json()) as Task;
		expect(task.storyPoints).toBe(3);

		const invalid = await handlers.handleUpdateTask(
			jsonRequest(`/api/tasks/${task.id}`, "PUT", { storyPoints: -1 }),
			task.id,
		);
		expect(invalid.status).toBe(400);

		await handlers.handleUpdateTask(jsonRequest(`/api/tasks/${task.id}`, "PUT", { storyPoints: 8 }), task.id);
		expect((await filesystem.loadTask(task.id))?.storyPoints).toBe(8);

		await handlers.handleUpdateTask(jsonRequest(`/api/tasks/${task.id}`, "PUT", { storyPoints: null }), task.id);
		expect((await filesystem.loadTask(task.id))?.storyPoints).toBeUndefined();
	});

	it("saves the monthly capacity from settings and turns it off with 0", async () => {
		const saved = await handlers.handleUpdateConfig(jsonRequest("/api/config", "PUT", { pointsPerMonth: 40 }));
		expect(((await saved.json()) as BacklogConfig).pointsPerMonth).toBe(40);
		filesystem.invalidateConfigCache();
		expect((await filesystem.loadConfig())?.pointsPerMonth).toBe(40);

		expect((await handlers.handleUpdateConfig(jsonRequest("/api/config", "PUT", { pointsPerMonth: -5 }))).status).toBe(
			400,
		);

		await handlers.handleUpdateConfig(jsonRequest("/api/config", "PUT", { pointsPerMonth: 0 }));
		filesystem.invalidateConfigCache();
		expect((await filesystem.loadConfig())?.pointsPerMonth).toBeUndefined();
	});
});
