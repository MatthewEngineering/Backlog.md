import { basename } from "node:path";
import type { ServerWebSocket } from "bun";

/**
 * The browser terminal: one login shell per WebSocket, running in a pseudo-terminal (Bun's built-in
 * PTY, so no native addon) with the project root as its working directory.
 *
 * Wire protocol on `/api/terminal`:
 * - server -> client: binary frames carrying raw terminal output.
 * - client -> server: text frames carrying JSON, either `{ "type": "input", "data": string }` or
 *   `{ "type": "resize", "cols": number, "rows": number }`.
 * The socket closes when the shell exits, and the shell is killed when the socket closes.
 */

export const TERMINAL_PATH = "/api/terminal";

export type TerminalSocketData = {
	kind: "terminal";
	cols: number;
	rows: number;
	process?: Bun.Subprocess;
};

export function isTerminalSocket(ws: ServerWebSocket<unknown>): ws is ServerWebSocket<TerminalSocketData> {
	const data = ws.data as Partial<TerminalSocketData> | undefined;
	return data?.kind === "terminal";
}

export type TerminalAvailability = { available: true } | { available: false; reason: string };

/**
 * A browser terminal is a shell for anyone who can reach the page, so it is available only while
 * the server listens on a loopback address, unless the person starting the server opted in.
 */
export function getTerminalAvailability(
	listensOnLoopback: boolean,
	allowRemoteTerminal: boolean,
): TerminalAvailability {
	if (process.platform === "win32") {
		return { available: false, reason: "The browser terminal is not supported on Windows." };
	}
	if (!listensOnLoopback && !allowRemoteTerminal) {
		return {
			available: false,
			reason:
				"The terminal is off because this server accepts remote connections. Restart with 'backlog browser --terminal' to allow it.",
		};
	}
	return { available: true };
}

function clampSize(value: string | null, fallback: number, max: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/** The socket data for an upgrade request; the client sends its initial size as query parameters. */
export function terminalSocketData(url: URL): TerminalSocketData {
	return {
		kind: "terminal",
		cols: clampSize(url.searchParams.get("cols"), 80, 500),
		rows: clampSize(url.searchParams.get("rows"), 24, 200),
	};
}

function shellCommand(): string[] {
	const shell = process.env.SHELL || "/bin/sh";
	// A login shell loads the user's profile, so PATH matches the shell they normally open.
	return ["bash", "zsh", "fish"].includes(basename(shell)) ? [shell, "-l"] : [shell];
}

export function openTerminal(ws: ServerWebSocket<TerminalSocketData>, cwd: string): void {
	const { BACKLOG_LAUNCHER: _launcher, ...env } = process.env;
	try {
		const shell = Bun.spawn(shellCommand(), {
			cwd,
			env: { ...env, TERM: "xterm-256color" },
			terminal: {
				cols: ws.data.cols,
				rows: ws.data.rows,
				data: (_terminal, output) => {
					ws.sendBinary(output);
				},
			},
		});
		ws.data.process = shell;
		void shell.exited.then(() => ws.close(1000, "Shell exited"));
	} catch (error) {
		ws.close(1011, error instanceof Error ? error.message.slice(0, 120) : "Failed to start shell");
	}
}

export function handleTerminalMessage(ws: ServerWebSocket<TerminalSocketData>, message: string | Buffer): void {
	const terminal = ws.data.process?.terminal;
	if (!terminal || typeof message !== "string") return;
	let parsed: { type?: unknown; data?: unknown; cols?: unknown; rows?: unknown };
	try {
		parsed = JSON.parse(message);
	} catch {
		return;
	}
	if (parsed.type === "input" && typeof parsed.data === "string") {
		terminal.write(parsed.data);
	} else if (parsed.type === "resize" && typeof parsed.cols === "number" && typeof parsed.rows === "number") {
		terminal.resize(clampSize(String(parsed.cols), 80, 500), clampSize(String(parsed.rows), 24, 200));
	}
}

export function closeTerminal(ws: ServerWebSocket<TerminalSocketData>): void {
	const shell = ws.data.process;
	ws.data.process = undefined;
	if (!shell) return;
	try {
		shell.kill("SIGHUP");
	} catch {}
	try {
		shell.terminal?.close();
	} catch {}
}
