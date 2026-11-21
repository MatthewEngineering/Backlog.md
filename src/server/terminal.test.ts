import { describe, expect, it } from "bun:test";
import { getTerminalAvailability } from "./terminal.ts";

describe.skipIf(process.platform === "win32")("getTerminalAvailability", () => {
	it("is available on a loopback listener", () => {
		expect(getTerminalAvailability(true, false)).toEqual({ available: true });
	});

	it("is refused on a remote listener unless the server was started with --terminal", () => {
		const refused = getTerminalAvailability(false, false);
		expect(refused.available).toBe(false);
		expect(getTerminalAvailability(false, true)).toEqual({ available: true });
	});
});
