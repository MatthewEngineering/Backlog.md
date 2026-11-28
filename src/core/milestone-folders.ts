import type { Milestone, Task } from "../types/index.ts";
import { milestoneKey } from "./milestones.ts";

/**
 * Projects as milestone folders: a top-level milestone is a folder, and the lists under it are
 * its sub-milestones. These helpers map the older `project` field (on tasks) and `Area::` body
 * line (on milestones) onto that tree.
 */

/** The configured project a milestone belongs to: its `Area:: <name>` body line, else the project most of its tasks carry. */
export function milestoneArea(
	milestone: Milestone,
	tasks: readonly Task[],
	projects: readonly string[],
): string | undefined {
	const canonical = (value: string | undefined) =>
		projects.find((project) => project.toLowerCase() === (value ?? "").trim().toLowerCase());
	const fromBody = canonical(milestone.rawContent.match(/^\s*[-*]?\s*Area::\s*(.+?)\s*$/im)?.[1]);
	if (fromBody) return fromBody;
	const counts = new Map<string, number>();
	for (const task of tasks) {
		if (milestoneKey(task.milestone) !== milestoneKey(milestone.id)) continue;
		const project = canonical(task.project);
		if (project) counts.set(project, (counts.get(project) ?? 0) + 1);
	}
	let best: string | undefined;
	let bestCount = 0;
	for (const [project, count] of counts) {
		if (count > bestCount) {
			best = project;
			bestCount = count;
		}
	}
	return best;
}

/** The top-level milestone a milestone sits under (itself when top-level). Cycle-safe. */
export function rootMilestone(milestoneId: string, milestones: readonly Milestone[]): Milestone | undefined {
	const byKey = new Map(milestones.map((milestone) => [milestoneKey(milestone.id), milestone]));
	const seen = new Set<string>();
	let cursor = byKey.get(milestoneKey(milestoneId));
	while (cursor?.parent) {
		const key = milestoneKey(cursor.id);
		if (seen.has(key)) break;
		seen.add(key);
		const parent = byKey.get(milestoneKey(cursor.parent));
		if (!parent) break;
		cursor = parent;
	}
	return cursor;
}

/** Configured projects that have no top-level milestone of the same name yet. */
export function projectsWithoutFolders(projects: readonly string[], milestones: readonly Milestone[]): string[] {
	const folders = new Set(
		milestones.filter((milestone) => !milestone.parent).map((milestone) => milestone.title.trim().toLowerCase()),
	);
	return projects.filter((project) => !folders.has(project.trim().toLowerCase()));
}
