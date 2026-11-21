/**
 * Story points size a task. Any non-negative number is accepted (0.5, 1, 2, 3, 5, 8, ...), so a
 * team can use whichever scale it prefers. Stored in task frontmatter as `story_points`.
 */

export function invalidStoryPointsMessage(fieldName = "Story points"): string {
	return `${fieldName} must be a non-negative number (for example, 3 or 0.5).`;
}

/**
 * Validate story points from any surface (CLI string, MCP/web number). Empty input means "none".
 * Throws on anything that is not a finite non-negative number.
 */
export function normalizeStoryPoints(value: unknown, fieldName = "Story points"): number | undefined {
	if (value === undefined || value === null) return undefined;
	const text = typeof value === "number" ? String(value) : String(value).trim();
	if (text === "") return undefined;
	const points = Number(text);
	if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(points)) {
		throw new Error(invalidStoryPointsMessage(fieldName));
	}
	return points;
}

/**
 * Story points as read from a stored file. A hand-edited invalid value is ignored rather than
 * making the whole task unreadable.
 */
export function readStoredStoryPoints(value: unknown): number | undefined {
	try {
		return normalizeStoryPoints(value, "story_points");
	} catch {
		return undefined;
	}
}
