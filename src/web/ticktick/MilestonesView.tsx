import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { milestoneKey } from "../../core/milestones";
import { addDays, addMonths, type DayKey, daysBetween, formatDay, startOfWeek } from "../utils/planning";
import { IconBoard, IconCaret, IconGantt, IconList, IconMenu, IconMore, IconPlus } from "./icons";
import {
	loadByBucket,
	type MilestoneRow,
	milestoneRows,
	PERIOD_LABELS,
	type Period,
	type PeriodPreset,
	presetPeriod,
	summarize,
} from "./milestoneStats";
import { relativeDayLabel } from "./model";
import { type ListDialog, ListDialogView } from "./Sidebar";
import { useTick } from "./store";

/**
 * Every milestone at once, three ways: a tree table, a board, and a Gantt chart with story point
 * rollups for a chosen period. Routes: /app/milestones/<list|board|gantt>.
 */

export type MilestoneLayout = "list" | "board" | "gantt";
type BoardGroup = "progress" | "parent" | "due";
type Zoom = "days" | "weeks" | "months";

const DAY_WIDTH: Record<Zoom, number> = { days: 30, weeks: 14, months: 4 };
const MARGIN_DAYS = 7;

interface Prefs {
	parentFilter: string;
	hideDone: boolean;
	boardGroup: BoardGroup;
	zoom: Zoom;
	preset: PeriodPreset;
	custom: Period | null;
	collapsed: string[];
}

const DEFAULT_PREFS: Prefs = {
	parentFilter: "",
	hideDone: false,
	boardGroup: "progress",
	zoom: "weeks",
	preset: "month",
	custom: null,
	collapsed: [],
};

function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
	const [prefs, setPrefs] = useState<Prefs>(() => {
		try {
			return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem("tt-milestones") ?? "{}") as Partial<Prefs>) };
		} catch {
			return DEFAULT_PREFS;
		}
	});
	const update = (patch: Partial<Prefs>) =>
		setPrefs((current) => {
			const next = { ...current, ...patch };
			try {
				localStorage.setItem("tt-milestones", JSON.stringify(next));
			} catch {
				// Remembering the view is a convenience.
			}
			return next;
		});
	return [prefs, update];
}

const pts = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function progressOf(row: MilestoneRow): number {
	if (row.points > 0) return row.donePoints / row.points;
	return row.tasks > 0 ? row.doneTasks / row.tasks : 0;
}

function Progress({ row }: { row: MilestoneRow }) {
	return (
		<span className="tt-ms-progress" title={`${Math.round(progressOf(row) * 100)}% done`}>
			<span style={{ width: `${progressOf(row) * 100}%` }} />
		</span>
	);
}

export default function MilestonesView({
	layout,
	onToggleSidebar,
}: {
	layout: MilestoneLayout;
	onToggleSidebar: () => void;
}) {
	const { tasks, milestones, statuses, today, config } = useTick();
	const [prefs, setPrefs] = usePrefs();
	const [dialog, setDialog] = useState<ListDialog | null>(null);

	const period: Period =
		prefs.preset === "custom" && prefs.custom ? prefs.custom : presetPeriod(prefs.preset === "custom" ? "month" : prefs.preset, today);
	const context = useMemo(() => ({ statuses, today, period }), [statuses, today, period.from, period.to]);
	const allRows = useMemo(() => milestoneRows(tasks, milestones, context), [tasks, milestones, context]);

	// Filters: inside one milestone (its subtree), and hide completed ones.
	const filtered = useMemo(() => {
		const byId = new Map(allRows.map((row) => [milestoneKey(row.milestone.id), row]));
		const within = (row: MilestoneRow) => {
			if (!prefs.parentFilter) return true;
			for (let cursor: MilestoneRow | undefined = row; cursor; ) {
				if (milestoneKey(cursor.milestone.id) === milestoneKey(prefs.parentFilter)) return true;
				cursor = cursor.parentId ? byId.get(milestoneKey(cursor.parentId)) : undefined;
			}
			return false;
		};
		return allRows.filter((row) => within(row) && !(prefs.hideDone && row.state === "done"));
	}, [allRows, prefs.parentFilter, prefs.hideDone]);

	// Folded milestones hide what is nested in them (list and Gantt).
	const visible = useMemo(() => {
		const folded = new Set(prefs.collapsed.map(milestoneKey));
		const hiddenParents = new Set<string>();
		return filtered.filter((row) => {
			const parent = row.parentId ? milestoneKey(row.parentId) : "";
			if (parent && (folded.has(parent) || hiddenParents.has(parent))) {
				hiddenParents.add(milestoneKey(row.milestone.id));
				return false;
			}
			return true;
		});
	}, [filtered, prefs.collapsed]);

	const toggleFold = (id: string) => {
		const key = milestoneKey(id);
		const collapsed = prefs.collapsed.map(milestoneKey);
		setPrefs({ collapsed: collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key] });
	};
	const isFolded = (id: string) => prefs.collapsed.map(milestoneKey).includes(milestoneKey(id));
	const parents = allRows.filter((row) => row.hasChildren);

	return (
		<section className="tt-main" aria-label="Milestones">
			<header className="tt-main-head">
				<button type="button" className="tt-icon-btn tt-menu-toggle" aria-label="Open sidebar" onClick={onToggleSidebar}>
					<IconMenu />
				</button>
				<h1 className="tt-main-title">
					Milestones<span className="tt-main-sub">{filtered.length}</span>
				</h1>
				<div className="tt-seg" role="group" aria-label="Layout">
					{(
						[
							["list", "List", <IconList key="l" size={14} />],
							["board", "Board", <IconBoard key="b" size={14} />],
							["gantt", "Gantt", <IconGantt key="g" size={14} />],
						] as const
					).map(([value, label, icon]) => (
						<Link key={value} to={`/app/milestones/${value}`} className={`tt-seg-link ${layout === value ? "is-active" : ""}`}>
							{icon}
							{label}
						</Link>
					))}
				</div>
				<button type="button" className="tt-btn is-primary" onClick={() => setDialog({ mode: "create" })}>
					<IconPlus size={14} /> Milestone
				</button>
			</header>
			<div className="tt-ms-toolbar">
				<select
					className="tt-select"
					aria-label="Show milestones inside"
					value={prefs.parentFilter}
					onChange={(event) => setPrefs({ parentFilter: event.target.value })}
				>
					<option value="">All milestones</option>
					{parents.map((row) => (
						<option key={row.milestone.id} value={row.milestone.id}>
							Inside {row.path}
						</option>
					))}
				</select>
				<label className="tt-ms-check">
					<input type="checkbox" checked={prefs.hideDone} onChange={(event) => setPrefs({ hideDone: event.target.checked })} />
					Hide completed
				</label>
				{layout === "board" && (
					<div className="tt-seg" role="group" aria-label="Columns">
						{(
							[
								["progress", "Progress"],
								["parent", "Parent"],
								["due", "Due"],
							] as const
						).map(([value, label]) => (
							<button
								key={value}
								type="button"
								className={prefs.boardGroup === value ? "is-active" : ""}
								onClick={() => setPrefs({ boardGroup: value })}
							>
								{label}
							</button>
						))}
					</div>
				)}
				{layout === "gantt" && (
					<>
						<span className="tt-ms-spacer" />
						<select
							className="tt-select"
							aria-label="Period"
							value={prefs.preset}
							onChange={(event) => {
								const preset = event.target.value as PeriodPreset;
								setPrefs({ preset, custom: preset === "custom" ? (prefs.custom ?? period) : prefs.custom });
							}}
						>
							{(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((preset) => (
								<option key={preset} value={preset}>
									{PERIOD_LABELS[preset]}
								</option>
							))}
						</select>
						{prefs.preset === "custom" && (
							<>
								<input
									type="date"
									className="tt-select"
									aria-label="Period start"
									value={period.from}
									onChange={(event) =>
										event.target.value && setPrefs({ custom: { from: event.target.value, to: period.to < event.target.value ? event.target.value : period.to } })
									}
								/>
								<input
									type="date"
									className="tt-select"
									aria-label="Period end"
									value={period.to}
									onChange={(event) =>
										event.target.value && setPrefs({ custom: { from: period.from > event.target.value ? event.target.value : period.from, to: event.target.value } })
									}
								/>
							</>
						)}
						<div className="tt-seg" role="group" aria-label="Zoom">
							{(["days", "weeks", "months"] as const).map((zoom) => (
								<button
									key={zoom}
									type="button"
									className={prefs.zoom === zoom ? "is-active" : ""}
									onClick={() => setPrefs({ zoom })}
								>
									{zoom[0]?.toUpperCase()}
									{zoom.slice(1)}
								</button>
							))}
						</div>
					</>
				)}
			</div>

			{milestones.length === 0 ? (
				<div className="tt-ms-empty">No milestones yet. Add one with the button above.</div>
			) : layout === "list" ? (
				<MilestoneTable rows={visible} today={today} isFolded={isFolded} onFold={toggleFold} onEdit={(row) => setDialog({ mode: "edit", milestone: row.milestone })} />
			) : layout === "board" ? (
				<MilestoneBoard rows={filtered} group={prefs.boardGroup} today={today} />
			) : (
				<MilestoneGantt
					rows={visible}
					shown={filtered}
					period={period}
					zoom={prefs.zoom}
					pointsPerMonth={config?.pointsPerMonth}
					isFolded={isFolded}
					onFold={toggleFold}
				/>
			)}
			{dialog && <ListDialogView dialog={dialog} onClose={() => setDialog(null)} />}
		</section>
	);
}

function NameCell({
	row,
	isFolded,
	onFold,
}: {
	row: MilestoneRow;
	isFolded: (id: string) => boolean;
	onFold: (id: string) => void;
}) {
	return (
		<span className="tt-ms-name" style={{ paddingLeft: row.depth * 18 }}>
			<button
				type="button"
				className={`tt-caret ${isFolded(row.milestone.id) ? "" : "is-open"}`}
				style={{ visibility: row.hasChildren ? "visible" : "hidden" }}
				aria-label={isFolded(row.milestone.id) ? "Expand" : "Collapse"}
				onClick={() => onFold(row.milestone.id)}
			>
				<IconCaret />
			</button>
			<Link to={`/app/list/${encodeURIComponent(row.milestone.id)}`} title={row.path} className={row.hasChildren ? "is-parent" : ""}>
				{row.milestone.title}
			</Link>
		</span>
	);
}

function DueText({ day, today, done }: { day: DayKey | null; today: DayKey; done: boolean }) {
	if (!day) return <span className="tt-ms-muted">—</span>;
	return <span className={!done && day < today ? "tt-ms-overdue" : ""}>{relativeDayLabel(day, today)}</span>;
}

// ------------------------------------------------------------------------------------------ list

function MilestoneTable({
	rows,
	today,
	isFolded,
	onFold,
	onEdit,
}: {
	rows: MilestoneRow[];
	today: DayKey;
	isFolded: (id: string) => boolean;
	onFold: (id: string) => void;
	onEdit: (row: MilestoneRow) => void;
}) {
	return (
		<div className="tt-main-scroll">
			<table className="tt-ms-table">
				<thead>
					<tr>
						<th>Milestone</th>
						<th>Due</th>
						<th>Tasks</th>
						<th className="is-num">Points</th>
						<th className="is-num">Open</th>
						<th className="is-num">Overdue</th>
						<th aria-label="Actions" />
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.milestone.id} className={row.state === "done" ? "is-done" : ""}>
							<td>
								<NameCell row={row} isFolded={isFolded} onFold={onFold} />
							</td>
							<td>
								<DueText day={row.due} today={today} done={row.state === "done"} />
							</td>
							<td>
								<span className="tt-ms-tasks">
									<Progress row={row} />
									{row.doneTasks}/{row.tasks}
								</span>
							</td>
							<td className="is-num">
								{pts(row.donePoints)}/{pts(row.points)}
							</td>
							<td className="is-num">{pts(row.openPoints)}</td>
							<td className={`is-num ${row.overduePoints ? "tt-ms-overdue" : "tt-ms-muted"}`}>{pts(row.overduePoints)}</td>
							<td>
								<button type="button" className="tt-icon-btn" aria-label={`Edit ${row.milestone.title}`} onClick={() => onEdit(row)}>
									<IconMore size={14} />
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="tt-ms-foot">Numbers include the milestones nested inside. Overdue is open work past its due date.</p>
		</div>
	);
}

// ------------------------------------------------------------------------------------------ board

const MS_DRAG_TYPE = "application/x-backlog-milestone";

/** `dropParent` set (a milestone ID, or null for the top level) makes the column a drop target that re-parents. */
type BoardColumn = { key: string; title: string; rows: MilestoneRow[]; dropParent?: string | null; tone?: string };

function MilestoneBoard({ rows, group, today }: { rows: MilestoneRow[]; group: BoardGroup; today: DayKey }) {
	const { milestones, setListParent } = useTick();
	const navigate = useNavigate();

	const columns = useMemo<BoardColumn[]>(() => {
		// A milestone with milestones inside would repeat their work as its own card; it shows only
		// when tasks sit in it directly. The Parent grouping shows the nesting itself.
		const cards = rows.filter((row) => !row.hasChildren || row.ownTasks > 0);
		if (group === "progress") {
			const make = (key: MilestoneRow["state"], title: string): BoardColumn => ({
				key,
				title,
				rows: cards.filter((row) => row.state === key),
			});
			return [
				make("not-started", "Not started"),
				make("in-progress", "In progress"),
				make("done", "Done"),
				make("empty", "No tasks yet"),
			].filter((column) => column.key !== "empty" || column.rows.length > 0);
		}
		if (group === "due") {
			const weekEnd = addDays(startOfWeek(today), 6);
			const monthEnd = addDays(addMonths(`${today.slice(0, 7)}-01`, 1), -1);
			const bucket = (row: MilestoneRow) => {
				const due = row.due ?? row.end;
				if (!due) return "none";
				if (due < today && row.state !== "done") return "overdue";
				if (due <= weekEnd) return "week";
				if (due <= monthEnd) return "month";
				return "later";
			};
			return (
				[
					["overdue", "Overdue", "overdue"],
					["week", "This week"],
					["month", "This month"],
					["later", "Later"],
					["none", "No due date"],
				] as const
			).map(([key, title, tone]): BoardColumn => ({ key, title, tone, rows: cards.filter((row) => bucket(row) === key) }));
		}
		// By parent: each milestone with milestones inside is a column of them; the rest sit at the top level.
		const parents = rows.filter((row) => row.hasChildren);
		const columns: BoardColumn[] = parents.map((parent) => ({
			key: parent.milestone.id,
			title: parent.path,
			dropParent: parent.milestone.id,
			rows: rows.filter((row) => row.parentId && milestoneKey(row.parentId) === milestoneKey(parent.milestone.id)),
		}));
		columns.push({
			key: "top",
			title: "Top level",
			dropParent: null,
			rows: rows.filter((row) => !row.parentId && !row.hasChildren),
		});
		return columns;
	}, [rows, group, today]);

	return (
		<div className="tt-ms-board">
			{columns.map((column) => (
				<div
					key={column.key}
					className="tt-ms-column"
					onDragOver={(event) => {
						if (column.dropParent === undefined || !event.dataTransfer.types.includes(MS_DRAG_TYPE)) return;
						event.preventDefault();
						event.currentTarget.classList.add("is-drop");
					}}
					onDragLeave={(event) => event.currentTarget.classList.remove("is-drop")}
					onDrop={(event) => {
						event.currentTarget.classList.remove("is-drop");
						if (column.dropParent === undefined) return;
						const moving = milestones.find((milestone) => milestone.id === event.dataTransfer.getData(MS_DRAG_TYPE));
						if (!moving) return;
						event.preventDefault();
						if (column.dropParent && milestoneKey(column.dropParent) === milestoneKey(moving.id)) return;
						void setListParent(moving, column.dropParent);
					}}
				>
					<div className={`tt-ms-column-head ${column.tone === "overdue" ? "tt-ms-overdue" : ""}`}>
						<span title={column.title}>{column.title}</span>
						<span className="tt-group-count">{column.rows.length}</span>
					</div>
					<div className="tt-ms-column-body">
						{column.rows.map((row) => (
							<div
								key={row.milestone.id}
								className={`tt-ms-card ${row.state === "done" ? "is-done" : ""}`}
								draggable={group === "parent"}
								onDragStart={(event) => {
									event.dataTransfer.setData(MS_DRAG_TYPE, row.milestone.id);
									event.dataTransfer.effectAllowed = "move";
								}}
								onClick={() => navigate(`/app/list/${encodeURIComponent(row.milestone.id)}`)}
								role="link"
								tabIndex={0}
								onKeyDown={(event) => {
									if (event.key === "Enter") navigate(`/app/list/${encodeURIComponent(row.milestone.id)}`);
								}}
							>
								{row.parentId && group !== "parent" && (
									<div className="tt-ms-card-path">{row.path.split(" / ").slice(0, -1).join(" / ")}</div>
								)}
								<div className="tt-ms-card-title">{row.milestone.title}</div>
								<Progress row={row} />
								<div className="tt-ms-card-meta">
									<span>
										{row.doneTasks}/{row.tasks} tasks
									</span>
									<span>
										{pts(row.donePoints)}/{pts(row.points)} pts
									</span>
									<DueText day={row.due} today={today} done={row.state === "done"} />
								</div>
								{row.overduePoints > 0 && <div className="tt-ms-overdue tt-ms-card-warn">{pts(row.overduePoints)} pts overdue</div>}
								{row.hasChildren && <div className="tt-ms-card-path">Numbers include the milestones inside</div>}
							</div>
						))}
						{column.rows.length === 0 && (
							<div className="tt-quadrant-empty">{column.dropParent !== undefined ? "Drag milestones here" : "None"}</div>
						)}
					</div>
				</div>
			))}
		</div>
	);
}

// ------------------------------------------------------------------------------------------ gantt

function MilestoneGantt({
	rows,
	shown,
	period,
	zoom,
	pointsPerMonth,
	isFolded,
	onFold,
}: {
	rows: MilestoneRow[];
	shown: MilestoneRow[];
	period: Period;
	zoom: Zoom;
	pointsPerMonth?: number;
	isFolded: (id: string) => boolean;
	onFold: (id: string) => void;
}) {
	const { tasks, milestones, statuses, today } = useTick();
	const navigate = useNavigate();
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const dayWidth = DAY_WIDTH[zoom];
	const context = { statuses, today, period };
	const summary = summarize(shown, tasks, milestones, context, pointsPerMonth);

	const { rangeStart, totalDays } = useMemo(() => {
		let first = period.from < today ? period.from : today;
		let last = period.to > today ? period.to : today;
		for (const row of rows) {
			if (row.start && row.start < first) first = row.start;
			if (row.end && row.end > last) last = row.end;
		}
		const rangeStart = zoom === "months" ? `${addDays(first, -MARGIN_DAYS).slice(0, 7)}-01` : startOfWeek(addDays(first, -MARGIN_DAYS));
		return { rangeStart, totalDays: daysBetween(rangeStart, addDays(last, MARGIN_DAYS * 2)) + 1 };
	}, [rows, period.from, period.to, today, zoom]);

	const x = (day: DayKey) => daysBetween(rangeStart, day) * dayWidth;
	const width = totalDays * dayWidth;
	const rangeEnd = addDays(rangeStart, totalDays - 1);

	// Scroll the period into view when it or the zoom changes.
	useEffect(() => {
		const element = scrollRef.current;
		if (element) element.scrollLeft = Math.max(0, x(period.from) - 40);
	}, [period.from, zoom, rangeStart]);

	// Header: months on top; weeks (or days) below.
	const months: Array<{ key: string; left: number; width: number; label: string }> = [];
	for (let first = `${rangeStart.slice(0, 7)}-01`; first <= rangeEnd; first = addMonths(first, 1)) {
		const start = first < rangeStart ? rangeStart : first;
		const lastDay = addDays(addMonths(first, 1), -1);
		const end = lastDay > rangeEnd ? rangeEnd : lastDay;
		months.push({
			key: first,
			left: x(start),
			width: (daysBetween(start, end) + 1) * dayWidth,
			label: formatDay(first, zoom === "months" ? { month: "short", year: "2-digit" } : { month: "long", year: "numeric" }),
		});
	}
	const ticks: Array<{ key: string; left: number; label: string; weekend?: boolean }> = [];
	if (zoom === "days") {
		for (let day = rangeStart; day <= rangeEnd; day = addDays(day, 1)) {
			const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
			ticks.push({ key: day, left: x(day), label: day.slice(8).replace(/^0/, ""), weekend: weekday === 0 || weekday === 6 });
		}
	} else if (zoom === "weeks") {
		for (let day = startOfWeek(rangeStart); day <= rangeEnd; day = addDays(day, 7)) {
			if (day >= rangeStart) ticks.push({ key: day, left: x(day), label: day.slice(8).replace(/^0/, "") });
		}
	}

	// Load row: open points due per week (per month when zoomed out).
	const bucketOf = (day: DayKey) => (zoom === "months" ? `${day.slice(0, 7)}-01` : startOfWeek(day));
	const load = loadByBucket(shown, tasks, milestones, statuses, today, bucketOf);
	const buckets: Array<{ key: string; left: number; width: number; points: number; capacity: number | null }> = [];
	for (let day = bucketOf(rangeStart); day <= rangeEnd; day = zoom === "months" ? addMonths(day, 1) : addDays(day, 7)) {
		const next = zoom === "months" ? addMonths(day, 1) : addDays(day, 7);
		const days = daysBetween(day, next);
		buckets.push({
			key: day,
			left: x(day),
			width: days * dayWidth,
			points: load.get(day) ?? 0,
			capacity: pointsPerMonth ? (pointsPerMonth * days) / 30.44 : null,
		});
	}
	const maxLoad = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.points, bucket.capacity ?? 0)));
	const periodLabel = `${formatDay(period.from, { month: "short", day: "numeric" })} – ${formatDay(period.to, { month: "short", day: "numeric", year: "numeric" })}`;
	const over = summary.capacity !== null && summary.requiredPoints > summary.capacity;

	return (
		<>
			<div className="tt-ms-summary" aria-label="Story points for the period">
				<Stat label={`Due in period (${periodLabel})`} value={`${pts(summary.periodPoints)} pts`} />
				<Stat
					label={`Required by ${formatDay(period.to, { month: "short", day: "numeric" })}`}
					value={`${pts(summary.requiredPoints)} pts`}
					hint={summary.overduePoints ? `${pts(summary.overduePoints)} overdue` : undefined}
					tone={summary.overduePoints ? "overdue" : undefined}
				/>
				{summary.capacity !== null && (
					<Stat
						label="Capacity left in period"
						value={`${pts(summary.capacity)} pts`}
						hint={over ? `${pts(summary.requiredPoints - summary.capacity)} over` : "fits"}
						tone={over ? "overdue" : "ok"}
					/>
				)}
				<Stat label="Open in all milestones shown" value={`${pts(summary.openPoints)} pts`} />
				{summary.unestimated > 0 && <Stat label="Open tasks without points" value={String(summary.unestimated)} tone="muted" />}
			</div>
			<div className="tt-gantt" ref={scrollRef}>
				<div className="tt-gantt-inner" style={{ width: `calc(var(--tt-gantt-left) + ${width}px)` }}>
					<div className="tt-gantt-row tt-gantt-head">
						<div className="tt-gantt-left">
							<span className="tt-ms-name">Milestone</span>
							<span className="is-num" title="All story points, nested milestones included">
								Pts
							</span>
							<span className="is-num" title="Open story points">
								Open
							</span>
							<span className="is-num" title="Open story points due in the period">
								Period
							</span>
							<span className="is-num" title="Open story points past due">
								Late
							</span>
						</div>
						<div className="tt-gantt-track" style={{ width }}>
							{months.map((month) => (
								<span key={month.key} className="tt-gantt-month" style={{ left: month.left, width: month.width }}>
									{month.label}
								</span>
							))}
							{ticks.map((tick) => (
								<span key={tick.key} className={`tt-gantt-tick ${tick.weekend ? "is-weekend" : ""}`} style={{ left: tick.left, width: zoom === "days" ? dayWidth : undefined }}>
									{tick.label}
								</span>
							))}
						</div>
					</div>
					<div className="tt-gantt-body">
						<div className="tt-gantt-overlay" style={{ left: `calc(var(--tt-gantt-left) + ${x(period.from)}px)`, width: (daysBetween(period.from, period.to) + 1) * dayWidth }} />
						<div className="tt-gantt-today" style={{ left: `calc(var(--tt-gantt-left) + ${x(today) + dayWidth / 2}px)` }} />
						{rows.map((row) => {
							const late = row.state !== "done" && row.end !== null && row.end < today && row.openPoints + (row.tasks - row.doneTasks) > 0;
							return (
								<div key={row.milestone.id} className={`tt-gantt-row ${row.state === "done" ? "is-done" : ""}`}>
									<div className="tt-gantt-left">
										<NameCell row={row} isFolded={isFolded} onFold={onFold} />
										<span className="is-num">{pts(row.points)}</span>
										<span className="is-num">{pts(row.openPoints)}</span>
										<span className={`is-num ${row.periodPoints ? "is-strong" : "tt-ms-muted"}`}>{pts(row.periodPoints)}</span>
										<span className={`is-num ${row.overduePoints ? "tt-ms-overdue" : "tt-ms-muted"}`}>{pts(row.overduePoints)}</span>
									</div>
									<div className="tt-gantt-track" style={{ width }}>
										{row.start && row.end && (
											<button
												type="button"
												className={`tt-gantt-bar ${row.hasChildren ? "is-parent" : ""} ${late ? "is-late" : ""}`}
												style={{ left: x(row.start), width: Math.max(dayWidth, (daysBetween(row.start, row.end) + 1) * dayWidth) }}
												title={`${row.path}\n${row.start} → ${row.end}\n${pts(row.donePoints)}/${pts(row.points)} pts done, ${row.doneTasks}/${row.tasks} tasks`}
												onClick={() => navigate(`/app/list/${encodeURIComponent(row.milestone.id)}`)}
											>
												<span className="tt-gantt-fill" style={{ width: `${progressOf(row) * 100}%` }} />
											</button>
										)}
										{row.start && row.end && (
											<span
												className="tt-gantt-label"
												style={{ left: x(row.end) + Math.max(dayWidth, 8) + 6 }}
											>
												{row.points > 0 ? `${pts(row.donePoints)}/${pts(row.points)} pts` : `${row.doneTasks}/${row.tasks} tasks`}
											</span>
										)}
										{row.due && (
											<span className={`tt-gantt-diamond ${late ? "is-late" : ""}`} style={{ left: x(row.due) + dayWidth / 2 }} title={`Due ${row.due}`} />
										)}
										{!row.start && !row.end && <span className="tt-gantt-nodate" style={{ left: x(today) + 12 }}>no dates</span>}
									</div>
								</div>
							);
						})}
						<div className="tt-gantt-row tt-gantt-load">
							<div className="tt-gantt-left">
								<span className="tt-ms-name">Points due {zoom === "months" ? "per month" : "per week"}</span>
							</div>
							<div className="tt-gantt-track" style={{ width }}>
								{buckets.map((bucket) => (
									<div
										key={bucket.key}
										className={`tt-gantt-bucket ${bucket.capacity !== null && bucket.points > bucket.capacity ? "is-over" : ""}`}
										style={{ left: bucket.left, width: bucket.width }}
										title={`${pts(bucket.points)} pts due${bucket.capacity !== null ? ` (capacity ${pts(Math.round(bucket.capacity * 10) / 10)})` : ""}`}
									>
										{bucket.capacity !== null && (
											<span className="tt-gantt-capacity" style={{ bottom: `${(bucket.capacity / maxLoad) * 100}%` }} />
										)}
										<span className="tt-gantt-load-bar" style={{ height: `${(bucket.points / maxLoad) * 100}%` }} />
										{bucket.points > 0 && bucket.width >= 18 && <span className="tt-gantt-load-num">{pts(bucket.points)}</span>}
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "overdue" | "ok" | "muted" }) {
	return (
		<div className={`tt-ms-stat ${tone ? `is-${tone}` : ""}`}>
			<span className="tt-ms-stat-label">{label}</span>
			<span className="tt-ms-stat-value">
				{value}
				{hint && <span className="tt-ms-stat-hint">{hint}</span>}
			</span>
		</div>
	);
}
