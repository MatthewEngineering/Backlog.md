import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "../../types";
import { IconMenu } from "./icons";
import { compareTasks, tasksForView } from "./model";
import { useTick } from "./store";

/**
 * TickTick's Pomodoro timer: 25-minute focus, 5-minute break (15 after every fourth). The
 * running timer and today's count live in this browser only; nothing is written to the backlog.
 */
const FOCUS_MIN = 25;
const SHORT_BREAK_MIN = 5;
const LONG_BREAK_MIN = 15;

type Phase = "focus" | "break";

interface FocusLog {
	day: string;
	pomos: number;
	minutes: number;
}

function readLog(today: string): FocusLog {
	try {
		const log = JSON.parse(localStorage.getItem("tt-focus-log") ?? "null") as FocusLog | null;
		if (log && log.day === today) return log;
	} catch {
		// Fall through to an empty day.
	}
	return { day: today, pomos: 0, minutes: 0 };
}

function writeLog(log: FocusLog) {
	try {
		localStorage.setItem("tt-focus-log", JSON.stringify(log));
	} catch {
		// The count is a convenience.
	}
}

interface FocusViewProps {
	selected: Task | null;
	onToggleSidebar: () => void;
}

export default function FocusView({ selected, onToggleSidebar }: FocusViewProps) {
	const { tasks, statuses, today, milestones, toggleComplete } = useTick();
	const [phase, setPhase] = useState<Phase>("focus");
	const [remaining, setRemaining] = useState(FOCUS_MIN * 60);
	const [running, setRunning] = useState(false);
	const [taskId, setTaskId] = useState<string>(selected?.id ?? "");
	const [log, setLog] = useState<FocusLog>(() => readLog(today));
	const endAt = useRef<number | null>(null);

	const candidates = useMemo(
		() => tasksForView(tasks, { kind: "next7" }, { statuses, today, milestones }).sort(compareTasks),
		[tasks, statuses, today, milestones],
	);
	const task = tasks.find((candidate) => candidate.id === taskId) ?? null;
	const total = (phase === "focus" ? FOCUS_MIN : log.pomos % 4 === 0 && log.pomos > 0 ? LONG_BREAK_MIN : SHORT_BREAK_MIN) * 60;

	useEffect(() => {
		if (!running) return;
		endAt.current = Date.now() + remaining * 1000;
		const timer = setInterval(() => {
			const left = Math.max(0, Math.round(((endAt.current ?? Date.now()) - Date.now()) / 1000));
			setRemaining(left);
			if (left === 0) {
				clearInterval(timer);
				setRunning(false);
				if (phase === "focus") {
					const next = { day: today, pomos: log.pomos + 1, minutes: log.minutes + FOCUS_MIN };
					setLog(next);
					writeLog(next);
					setPhase("break");
					setRemaining((next.pomos % 4 === 0 ? LONG_BREAK_MIN : SHORT_BREAK_MIN) * 60);
				} else {
					setPhase("focus");
					setRemaining(FOCUS_MIN * 60);
				}
				try {
					new Audio(
						"data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
					).play();
				} catch {
					// No sound is fine.
				}
				document.title = phase === "focus" ? "Break time" : "Focus time";
			}
		}, 250);
		return () => clearInterval(timer);
	}, [running]);

	useEffect(() => {
		if (!running) return;
		const minutes = Math.floor(remaining / 60);
		const seconds = remaining % 60;
		document.title = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} ${phase === "focus" ? "Focus" : "Break"}`;
	}, [remaining, running, phase]);

	const radius = 120;
	const circumference = 2 * Math.PI * radius;
	const progress = 1 - remaining / total;
	const color = phase === "focus" ? "var(--tt-accent)" : "var(--tt-q4)";

	return (
		<section className="tt-main" aria-label="Focus">
			<header className="tt-main-head">
				<button type="button" className="tt-icon-btn tt-menu-toggle" aria-label="Open lists" onClick={onToggleSidebar}>
					<IconMenu />
				</button>
				<h1 className="tt-main-title">{phase === "focus" ? "Pomodoro" : "Break"}</h1>
			</header>
			<div className="tt-focus">
				<select
					className="tt-input"
					style={{ maxWidth: 360 }}
					value={taskId}
					onChange={(event) => setTaskId(event.target.value)}
					aria-label="Task to focus on"
				>
					<option value="">Focus without a task</option>
					{selected && !candidates.some((candidate) => candidate.id === selected.id) && (
						<option value={selected.id}>{selected.title}</option>
					)}
					{candidates.map((candidate) => (
						<option key={candidate.id} value={candidate.id}>
							{candidate.title}
						</option>
					))}
				</select>
				<div className="tt-focus-ring">
					<svg width="260" height="260" viewBox="0 0 260 260" aria-hidden="true">
						<circle cx="130" cy="130" r={radius} fill="none" stroke="var(--tt-border)" strokeWidth="8" />
						<circle
							cx="130"
							cy="130"
							r={radius}
							fill="none"
							stroke={color}
							strokeWidth="8"
							strokeLinecap="round"
							strokeDasharray={circumference}
							strokeDashoffset={circumference * (1 - progress)}
							transform="rotate(-90 130 130)"
							style={{ transition: "stroke-dashoffset 0.25s linear" }}
						/>
					</svg>
					<div className="tt-focus-time">
						{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
					</div>
				</div>
				<div style={{ display: "flex", gap: 12 }}>
					<button
						type="button"
						className="tt-btn is-primary"
						style={{ minWidth: 120, height: 40, borderRadius: 20 }}
						onClick={() => setRunning((value) => !value)}
					>
						{running ? "Pause" : remaining === total ? "Start" : "Continue"}
					</button>
					{(running || remaining !== total) && (
						<button
							type="button"
							className="tt-btn"
							style={{ height: 40, borderRadius: 20 }}
							onClick={() => {
								setRunning(false);
								setPhase("focus");
								setRemaining(FOCUS_MIN * 60);
								document.title = "Backlog";
							}}
						>
							{phase === "focus" ? "Stop" : "Skip break"}
						</button>
					)}
					{task && (
						<button
							type="button"
							className="tt-btn"
							style={{ height: 40, borderRadius: 20 }}
							onClick={() => toggleComplete(task)}
						>
							Complete task
						</button>
					)}
				</div>
				<div className="tt-focus-stats">
					<div>
						<strong>{log.pomos}</strong>Today's Pomos
					</div>
					<div>
						<strong>
							{Math.floor(log.minutes / 60)}h {log.minutes % 60}m
						</strong>
						Today's Focus
					</div>
				</div>
			</div>
		</section>
	);
}
