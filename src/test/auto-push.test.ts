import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const task = (id: string): Task => ({
	id,
	title: `Task ${id}`,
	status: "To Do",
	assignee: [],
	createdDate: "2026-11-21",
	labels: [],
	dependencies: [],
	description: "Pushed from the server",
});

describe("autoPush", () => {
	let root: string;
	let projectDir: string;
	let remoteDir: string;
	let core: Core;

	const head = async (cwd: string, ref = "HEAD") => (await $`git rev-parse ${ref}`.cwd(cwd).text()).trim();

	beforeEach(async () => {
		root = createUniqueTestDir("test-auto-push");
		projectDir = join(root, "project");
		remoteDir = join(root, "remote.git");
		await mkdir(projectDir, { recursive: true });
		await $`git init --bare --initial-branch=main ${remoteDir}`.quiet();
		await $`git init --initial-branch=main`.cwd(projectDir).quiet();
		await $`git config user.name Test && git config user.email test@example.com`.cwd(projectDir).quiet();

		core = new Core(projectDir);
		await initializeTestProject(core, "Auto Push", true);
		await $`git add -A && git commit --allow-empty -m init`.cwd(projectDir).quiet();
		await $`git remote add origin ${remoteDir} && git push -u origin main`.cwd(projectDir).quiet();
	});

	afterEach(async () => {
		await safeCleanup(root);
	});

	async function setAutoPush(value: boolean) {
		const config = await core.filesystem.loadConfig();
		if (!config) throw new Error("config missing");
		config.autoCommit = true;
		config.autoPush = value;
		await core.filesystem.saveConfig(config);
		await $`git add -A && git commit -m config`.cwd(projectDir).quiet();
		await $`git push`.cwd(projectDir).quiet();
	}

	it("pushes each auto-commit to the upstream branch", async () => {
		await setAutoPush(true);
		expect((await core.filesystem.loadConfig())?.autoPush).toBe(true);

		await core.createTask(task("task-1"));

		expect(await head(remoteDir, "main")).toBe(await head(projectDir));
	});

	it("does not push when autoPush is off", async () => {
		await setAutoPush(false);
		const remoteBefore = await head(remoteDir, "main");

		await core.createTask(task("task-1"));

		expect(await head(remoteDir, "main")).toBe(remoteBefore);
		expect(await head(projectDir)).not.toBe(remoteBefore);
	});

	it("keeps the commit and warns when the remote rejects the push", async () => {
		await setAutoPush(true);
		const otherClone = join(root, "other");
		await $`git clone ${remoteDir} ${otherClone}`.quiet();
		await $`git -c user.name=Other -c user.email=other@example.com commit --allow-empty -m elsewhere && git push`
			.cwd(otherClone)
			.quiet();
		const remoteBefore = await head(remoteDir, "main");
		const warn = spyOn(console, "warn").mockImplementation(() => {});

		try {
			await core.createTask(task("task-1"));
			expect(warn.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
				"Committed locally but could not push to origin/main",
			);
		} finally {
			warn.mockRestore();
		}

		expect(await $`git log -1 --format=%s`.cwd(projectDir).text()).toContain("task-1");
		expect(await head(remoteDir, "main")).toBe(remoteBefore);
	});
});
