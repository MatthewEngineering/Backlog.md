import { useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { apiClient } from '../lib/api';

type Connection = 'checking' | 'connecting' | 'open' | 'closed' | 'unavailable';

/** Keys phone keyboards lack. Ctrl is sticky: it applies to the next key typed. */
const KEY_BAR: { label: string; sequence: string }[] = [
	{ label: 'Esc', sequence: '\x1b' },
	{ label: 'Tab', sequence: '\t' },
	{ label: '↑', sequence: '\x1b[A' },
	{ label: '↓', sequence: '\x1b[B' },
	{ label: '←', sequence: '\x1b[D' },
	{ label: '→', sequence: '\x1b[C' },
];

/** Ctrl+<letter> and the few punctuation keys that have control codes. */
function withCtrl(data: string): string {
	if (data.length !== 1) return data;
	const code = data.toUpperCase().charCodeAt(0);
	return code >= 64 && code <= 95 ? String.fromCharCode(code - 64) : data;
}

export default function TerminalPage() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const socketRef = useRef<WebSocket | null>(null);
	const ctrlRef = useRef(false);
	const [ctrl, setCtrl] = useState(false);
	const [connection, setConnection] = useState<Connection>('checking');
	const [message, setMessage] = useState<string | null>(null);
	// Bumped to start a fresh shell after the previous one ended.
	const [session, setSession] = useState(0);

	const send = useCallback((data: string) => {
		const socket = socketRef.current;
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
	}, []);

	const setSticky = useCallback((value: boolean) => {
		ctrlRef.current = value;
		setCtrl(value);
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let disposed = false;
		const terminal = new Terminal({
			cursorBlink: true,
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
			fontSize: window.matchMedia('(max-width: 640px)').matches ? 12 : 14,
			theme: { background: '#111827' },
		});
		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(container);
		fit.fit();
		terminalRef.current = terminal;

		const sendResize = () => {
			const socket = socketRef.current;
			if (socket?.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
			}
		};
		const resizeObserver = new ResizeObserver(() => {
			fit.fit();
			sendResize();
		});
		resizeObserver.observe(container);

		const input = terminal.onData((data) => {
			if (ctrlRef.current) {
				setSticky(false);
				send(withCtrl(data));
				return;
			}
			send(data);
		});

		const connect = async () => {
			try {
				const status = await apiClient.fetchTerminalStatus();
				if (disposed) return;
				if (!status.available) {
					setConnection('unavailable');
					setMessage(status.reason);
					return;
				}
			} catch {
				if (!disposed) {
					setConnection('closed');
					setMessage('Could not reach the server.');
				}
				return;
			}
			setConnection('connecting');
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const socket = new WebSocket(
				`${protocol}//${window.location.host}/api/terminal?cols=${terminal.cols}&rows=${terminal.rows}`,
			);
			socket.binaryType = 'arraybuffer';
			socketRef.current = socket;
			socket.onopen = () => {
				setConnection('open');
				setMessage(null);
				terminal.focus();
			};
			socket.onmessage = (event) => {
				terminal.write(typeof event.data === 'string' ? event.data : new Uint8Array(event.data as ArrayBuffer));
			};
			socket.onclose = (event) => {
				if (disposed) return;
				setConnection('closed');
				setMessage(event.reason || 'Session ended.');
			};
		};
		void connect();

		return () => {
			disposed = true;
			input.dispose();
			resizeObserver.disconnect();
			socketRef.current?.close();
			socketRef.current = null;
			terminal.dispose();
			terminalRef.current = null;
		};
	}, [send, session, setSticky]);

	const pressKey = (sequence: string) => {
		setSticky(false);
		send(sequence);
		terminalRef.current?.focus();
	};

	const keyClass =
		'h-9 min-w-11 shrink-0 rounded-md border border-gray-600 bg-gray-800 px-2 text-sm text-gray-100 active:bg-gray-600';

	return (
		<div className="flex h-full min-h-80 flex-col bg-gray-900">
			<div className="flex items-center justify-between gap-2 border-b border-gray-700 px-3 py-2 text-sm text-gray-300">
				<span className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className={`h-2 w-2 rounded-circle ${connection === 'open' ? 'bg-green-500' : connection === 'connecting' || connection === 'checking' ? 'bg-yellow-500' : 'bg-red-500'}`}
					/>
					<span className="font-medium text-gray-100">Terminal</span>
					{message && <span className="truncate text-gray-400">{message}</span>}
				</span>
				{connection === 'closed' && (
					<button
						type="button"
						onClick={() => setSession((value) => value + 1)}
						className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
					>
						New session
					</button>
				)}
			</div>
			<div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-1 py-1" />
			<div className="flex gap-1 overflow-x-auto border-t border-gray-700 px-2 py-2 md:hidden" role="toolbar" aria-label="Terminal keys">
				<button
					type="button"
					aria-pressed={ctrl}
					onClick={() => {
						setSticky(!ctrlRef.current);
						terminalRef.current?.focus();
					}}
					className={`${keyClass} ${ctrl ? 'border-blue-400 bg-blue-600' : ''}`}
				>
					Ctrl
				</button>
				{KEY_BAR.map((key) => (
					<button key={key.label} type="button" className={keyClass} onClick={() => pressKey(key.sequence)}>
						{key.label}
					</button>
				))}
			</div>
		</div>
	);
}
