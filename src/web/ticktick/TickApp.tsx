import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { BacklogConfig, Milestone, Task } from "../../types";
import { useTheme } from "../contexts/ThemeContext";
import CalendarView from "./CalendarView";
import FocusView from "./FocusView";
import {
	IconBoard,
	IconCalendar,
	IconCheckSquare,
	IconMatrix,
	IconMoon,
	IconSearch,
	IconSettings,
	IconSunny,
	IconTimer,
} from "./icons";
import MatrixView from "./MatrixView";
import { milestonePath, type ViewSpec } from "./model";
import Sidebar, { viewPath } from "./Sidebar";
import { TickProvider, useTick } from "./store";
import TaskDetail from "./TaskDetail";
import TaskListView from "./TaskListView";

/**
 * The TickTick-style task app, served at /app. Smart lists (Today, Next 7 Days, Inbox), nested
 * lists (milestones with `parent`; a list with lists inside is a folder), tags, an Eisenhower
 * matrix, a calendar and a Pomodoro timer, all over the same backlog records the classic pages
 * edit. Everything this fork adds lives here; the classic pages stay as upstream ships them.
 *
 * URL scheme: /app/<today|next7|inbox|all|completed>, /app/list/<milestone>,
 * /app/tag/<label>, /app/search?q=, /app/matrix, /app/calendar, /app/focus; `?task=<id>` opens a
 * task in the detail pane.
 */

type Screen = { mode: "tasks"; view: ViewSpec } | { mode: "matrix" } | { mode: "calendar" } | { mode: "focus" };

function parseScreen(pathname: string, search: string): Screen {
	const parts = pathname.replace(/^\/app\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
	const [head, arg] = parts;
	switch (head) {
		case "matrix":
			return { mode: "matrix" };
		case "calendar":
			return { mode: "calendar" };
		case "focus":
			return { mode: "focus" };
		case "next7":
		case "inbox":
		case "all":
		case "completed":
		case "today":
			return { mode: "tasks", view: { kind: head } };
		case "list":
			if (arg) return { mode: "tasks", view: { kind: "list", milestoneId: arg } };
			break;
		case "tag":
			if (arg) return { mode: "tasks", view: { kind: "tag", label: arg } };
			break;
		case "search":
			return { mode: "tasks", view: { kind: "search", query: new URLSearchParams(search).get("q") ?? "" } };
	}
	return { mode: "tasks", view: { kind: "today" } };
}

function viewTitle(view: ViewSpec, milestones: Milestone[]): string {
	switch (view.kind) {
		case "today":
			return "Today";
		case "next7":
			return "Next 7 Days";
		case "inbox":
			return "Inbox";
		case "all":
			return "All";
		case "completed":
			return "Completed";
		case "list":
			return milestonePath(view.milestoneId, milestones);
		case "tag":
			return `#${view.label}`;
		case "search":
			return "Search";
	}
}

interface TickAppProps {
	tasks: Task[];
	milestones: Milestone[];
	statuses: string[];
	config: BacklogConfig | null;
	projectName: string;
	onRefresh: () => Promise<void>;
	onRefreshMilestones: () => Promise<void>;
	onOpenFullEditor: (task: Task) => void;
}

export default function TickApp(props: TickAppProps) {
	return (
		<TickProvider {...props}>
			<TickShell />
		</TickProvider>
	);
}

function TickShell() {
	const { tasks, milestones, projectName, toast, dismissToast } = useTick();
	const { theme, toggleTheme } = useTheme();
	const location = useLocation();
	const navigate = useNavigate();
	const screen = useMemo(() => parseScreen(location.pathname, location.search), [location.pathname, location.search]);
	const params = new URLSearchParams(location.search);
	const taskParam = params.get("task")?.toLowerCase() ?? null;
	const selected = taskParam ? (tasks.find((task) => task.id.toLowerCase() === taskParam) ?? null) : null;
	const selectedId = selected?.id ?? null;
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const quickAddRef = useRef<HTMLInputElement | null>(null);
	const searchRef = useRef<HTMLInputElement | null>(null);
	// The task screen to come back to from the rail's Tasks button.
	const lastTaskPath = useRef("/app/today");
	if (screen.mode === "tasks") lastTaskPath.current = `${location.pathname}${location.search.replace(/([?&])task=[^&]*/, "$1")}`;

	useEffect(() => setDrawerOpen(false), [location.pathname]);

	useEffect(() => {
		const title = screen.mode === "tasks" ? viewTitle(screen.view, milestones) : screen.mode;
		document.title = `${title[0]?.toUpperCase()}${title.slice(1)} - ${projectName || "Backlog"}`;
	}, [screen, milestones, projectName]);

	const setTaskParam = useCallback(
		(id: string | null) => {
			const next = new URLSearchParams(location.search);
			if (id) next.set("task", id);
			else next.delete("task");
			const query = next.toString();
			navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true });
		},
		[location.pathname, location.search, navigate],
	);
	const onSelect = useCallback((task: Task) => setTaskParam(task.id), [setTaskParam]);
	const onClose = useCallback(() => setTaskParam(null), [setTaskParam]);

	// Keyboard: n / q add a task, / or Ctrl+K searches, Esc closes the detail.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing =
				target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
			if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (!typing && event.key === "/")) {
				event.preventDefault();
				if (screen.mode === "tasks" && screen.view.kind === "search") searchRef.current?.focus();
				else navigate("/app/search");
				return;
			}
			if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
			if ((event.key === "n" || event.key === "q") && quickAddRef.current) {
				event.preventDefault();
				quickAddRef.current.focus();
			} else if (event.key === "Escape" && selectedId) {
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [navigate, onClose, screen, selectedId]);

	const toggleSidebar = () => setDrawerOpen((open) => !open);
	const currentView = screen.mode === "tasks" ? screen.view : null;

	const railItems = [
		{ to: lastTaskPath.current, label: "Tasks", icon: <IconCheckSquare size={20} />, active: screen.mode === "tasks" && currentView?.kind !== "search" },
		{ to: "/app/calendar", label: "Calendar", icon: <IconCalendar size={20} />, active: screen.mode === "calendar" },
		{ to: "/app/matrix", label: "Eisenhower Matrix", icon: <IconMatrix size={20} />, active: screen.mode === "matrix" },
		{ to: "/app/focus", label: "Pomodoro", icon: <IconTimer size={20} />, active: screen.mode === "focus" },
		{ to: "/app/search", label: "Search", icon: <IconSearch size={20} />, active: currentView?.kind === "search" },
	];

	let main: React.ReactNode;
	if (screen.mode === "matrix") main = <MatrixView selectedId={selectedId} onSelect={onSelect} onToggleSidebar={toggleSidebar} />;
	else if (screen.mode === "calendar")
		main = <CalendarView selectedId={selectedId} onSelect={onSelect} onToggleSidebar={toggleSidebar} />;
	else if (screen.mode === "focus") main = <FocusView selected={selected} onToggleSidebar={toggleSidebar} />;
	else
		main = (
			<TaskListView
				key={viewPath(screen.view).split("?")[0]}
				view={screen.view}
				title={viewTitle(screen.view, milestones)}
				selectedId={selectedId}
				onSelect={onSelect}
				onToggleSidebar={toggleSidebar}
				quickAddRef={quickAddRef}
				searchRef={searchRef}
				onSearch={(query) => navigate(`/app/search?q=${encodeURIComponent(query)}`, { replace: true })}
			/>
		);

	const showSidebar = screen.mode === "tasks" || drawerOpen;

	return (
		<div className={`tt-root ${drawerOpen ? "is-drawer-open" : ""}`}>
			<nav className="tt-rail" aria-label="Apps">
				<div className="tt-avatar" title={projectName}>
					{(projectName || "B")[0]?.toUpperCase()}
				</div>
				{railItems.map((item) => (
					<Link key={item.label} to={item.to} className={`tt-rail-btn ${item.active ? "is-active" : ""}`} aria-label={item.label}>
						{item.icon}
						<span className="tt-tooltip">{item.label}</span>
					</Link>
				))}
				<div className="tt-rail-spacer" />
				<button type="button" className="tt-rail-btn" aria-label="Toggle theme" onClick={toggleTheme}>
					{theme === "dark" ? <IconSunny size={20} /> : <IconMoon size={20} />}
					<span className="tt-tooltip">{theme === "dark" ? "Light theme" : "Dark theme"}</span>
				</button>
				<Link to="/board" className="tt-rail-btn" aria-label="Classic Backlog views">
					<IconBoard size={20} />
					<span className="tt-tooltip">Classic Backlog (board, milestones, docs)</span>
				</Link>
				<button type="button" className="tt-rail-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
					<IconSettings size={20} />
					<span className="tt-tooltip">Settings</span>
				</button>
			</nav>
			{showSidebar && <Sidebar current={currentView} onNavigate={() => setDrawerOpen(false)} />}
			<div className="tt-backdrop" onClick={() => setDrawerOpen(false)} />
			{main}
			{(selected || screen.mode === "tasks") && (
				<TaskDetail task={selected} onClose={onClose} />
			)}
			<nav className="tt-tabbar" aria-label="Apps">
				{railItems.map((item) => (
					<Link key={item.label} to={item.to} className={item.active ? "is-active" : ""} aria-label={item.label}>
						{item.icon}
					</Link>
				))}
			</nav>
			{settingsOpen && <AppSettings onClose={() => setSettingsOpen(false)} />}
			{toast && (
				<div className="tt-toast" role="status">
					<span>{toast.message}</span>
					{toast.undo && (
						<button
							type="button"
							onClick={() => {
								toast.undo?.();
								dismissToast();
							}}
						>
							Undo
						</button>
					)}
				</div>
			)}
		</div>
	);
}

/** The task app's own settings: which interface opens at the home page, and project folders. */
function AppSettings({ onClose }: { onClose: () => void }) {
	const { config, setWebInterface, unconvertedProjects, convertProjectsToFolders } = useTick();
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const current = config?.webInterface === "classic" ? "classic" : "app";
	return (
		<div className="tt-modal-backdrop" onMouseDown={onClose}>
			<div className="tt-modal" role="dialog" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
				<h2>Settings</h2>
				<label htmlFor="tt-interface">Interface at the home page</label>
				<select
					id="tt-interface"
					className="tt-input"
					value={current}
					disabled={busy}
					onChange={async (event) => {
						const value = event.target.value as "app" | "classic";
						setBusy(true);
						const saved = await setWebInterface(value);
						setBusy(false);
						if (saved && value === "classic") navigate("/board");
					}}
				>
					<option value="app">Task app (this one)</option>
					<option value="classic">Classic Backlog.md</option>
				</select>
				<p className="tt-modal-note">
					Classic is Backlog.md exactly as upstream ships it. To come back, open <code>/app</code> and switch here.
				</p>
				{unconvertedProjects.length > 0 && (
					<>
						<label>Projects</label>
						<p className="tt-modal-note">
							{unconvertedProjects.join(", ")} {unconvertedProjects.length === 1 ? "is a project" : "are projects"} without a
							folder. Making folders turns each into a top-level list, moves that area's lists inside it, and takes the
							project off the tasks.
						</p>
						<button
							type="button"
							className="tt-btn"
							disabled={busy}
							onClick={async () => {
								setBusy(true);
								await convertProjectsToFolders();
								setBusy(false);
							}}
						>
							Make folders
						</button>
					</>
				)}
				<p className="tt-modal-note">
					Board columns, statuses and other project settings are on the{" "}
					<Link to="/settings" onClick={onClose}>
						classic settings page
					</Link>
					.
				</p>
				<div className="tt-modal-actions">
					<button type="button" className="tt-btn is-primary" onClick={onClose}>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}
