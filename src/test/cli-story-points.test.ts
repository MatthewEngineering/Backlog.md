import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { getTestCliPath } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const CLI_PATH = getTestCliPath();

describe("CLI story points", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = createUniqueTestDir("cli-story-points");
		await mkdir(testDir, { recursive: true });
		await $`git init -b main`.cwd(testDir).quiet();
		await initializeTestProject(new Core(testDir), "CLI story points");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("creates, edits, rolls up per milestone, and clears story points", async () => {
		await $`bun ${CLI_PATH} milestone add "Release"`.cwd(testDir).quiet();
		const created = await $`bun ${CLI_PATH} task create "Ship release" --points 3 -m Release --plain`
			.cwd(testDir)
			.text();
		expect(created).toContain("Story points: 3");
		await $`bun ${CLI_PATH} task create "Write notes" --points 0.5 -m Release`.cwd(testDir).quiet();

		const task = await new Core(testDir).filesystem.loadTask("task-1");
		expect(task?.filePath).toBeDefined();
		expect(await readFile(task?.filePath ?? "", "utf8")).toContain("story_points: 3");

		await $`bun ${CLI_PATH} task edit 1 --points 5 -s Done`.cwd(testDir).quiet();
		const milestones = await $`bun ${CLI_PATH} milestone list --plain`.cwd(testDir).text();
		expect(milestones).toContain("5/5.5 pts");

		await $`bun ${CLI_PATH} task edit 1 --clear-points`.cwd(testDir).quiet();
		expect((await new Core(testDir).filesystem.loadTask("task-1"))?.storyPoints).toBeUndefined();
	});

	it("rejects negative or non-numeric points and conflicting flags", async () => {
		const invalid = await $`bun ${CLI_PATH} task create "Bad" --points -2`.cwd(testDir).nothrow().quiet();
		expect(invalid.exitCode).not.toBe(0);
		const text = await $`bun ${CLI_PATH} task create "Bad" --points lots`.cwd(testDir).nothrow().quiet();
		expect(text.exitCode).not.toBe(0);
		expect(text.stderr.toString()).toContain("non-negative number");

		await $`bun ${CLI_PATH} task create "Valid"`.cwd(testDir).quiet();
		const conflict = await $`bun ${CLI_PATH} task edit 1 --points 2 --clear-points`.cwd(testDir).nothrow().quiet();
		expect(conflict.exitCode).toBe(1);
		expect(conflict.stderr.toString()).toContain("Cannot use --points and --clear-points together");
	});

	it("stores the team's monthly capacity", async () => {
		await $`bun ${CLI_PATH} config set pointsPerMonth 40`.cwd(testDir).quiet();
		expect((await $`bun ${CLI_PATH} config get pointsPerMonth`.cwd(testDir).text()).trim()).toBe("40");
		const invalid = await $`bun ${CLI_PATH} config set pointsPerMonth -1`.cwd(testDir).nothrow().quiet();
		expect(invalid.exitCode).toBe(1);
	});
});
