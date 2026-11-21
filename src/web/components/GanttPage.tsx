import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Milestone, Task } from '../../types';
import { buildMilestoneBuckets, milestoneKey } from '../utils/milestones';
import {
	addDays,
	addMonths,
	type DayKey,
	daysBetween,
	deriveMilestoneDependencies,
	formatDay,
	localDayKey,
	overCapacityMonths,
	storedDateToDayKey,
	storyPointsByMonth,
} from '../utils/planning';
import { PlanningHeader } from './PlanningControls';

type Zoom = 'days' | 'weeks' | 'months';
const DAY_WIDTH: Record<Zoom, number> = { days: 32, weeks: 12, months: 4 };
const ZOOM_LABELS: Record<Zoom, string> = { days: 'Days', weeks: 'Weeks', months: 'Months' };
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 56;
/** Empty days drawn before the first and after the last thing on the timeline. */
const MARGIN_DAYS = 7;

interface GanttPageProps {
	tasks: Task[];
	statuses: string[];
	milestones: Milestone[];
	pointsPerMonth?: number;
}

type MilestoneRow = {
	key: string;
	milestone: Milestone;
	due: DayKey | null;
	totalPoints: number;
	donePoints: number;
	taskCount: number;
	completed: boolean;
};

/** Month bands (with their story point totals) covering the visible range. */
function monthBands(rangeStart: DayKey, totalDays: number) {
	const bands: { month: string; startOffset: number; days: number }[] = [];
	const rangeEnd = addDays(rangeStart, totalDays - 1);
	for (let first = `${rangeStart.slice(0, 7)}-01`; first <= rangeEnd; first = addMonths(first, 1)) {
		const start = first < rangeStart ? rangeStart : first;
		const lastOfMonth = addDays(addMonths(first, 1), -1);
		const end = lastOfMonth > rangeEnd ? rangeEnd : lastOfMonth;
		bands.push({ month: first.slice(0, 7), startOffset: daysBetween(rangeStart, start), days: daysBetween(start, end) + 1 });
	}
	return bands;
}

export default function GanttPage({ tasks, statuses, milestones, pointsPerMonth }: GanttPageProps) {
	const today = localDayKey(new Date());
	const navigate = useNavigate();
	const [zoom, setZoom] = useState<Zoom>('weeks');
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const rows = useMemo<MilestoneRow[]>(() => {
		const buckets = new Map(buildMilestoneBuckets(tasks, milestones, statuses).map((bucket) => [bucket.key, bucket]));
		return milestones
			.map((milestone) => {
				const bucket = buckets.get(milestoneKey(milestone.id));
				return {
					key: milestoneKey(milestone.id),
					milestone,
					due: storedDateToDayKey(milestone.dueDate),
					totalPoints: bucket?.totalPoints ?? 0,
					donePoints: bucket?.donePoints ?? 0,
					taskCount: bucket?.total ?? 0,
					completed: bucket?.isCompleted ?? false,
				};
			})
			.sort((a, b) => {
				// Dated milestones in due order first; undated ones after, by title.
				if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
				if (a.due && !b.due) return -1;
				if (!a.due && b.due) return 1;
				return a.milestone.title.localeCompare(b.milestone.title);
			});
	}, [tasks, milestones, statuses]);

	const dependencies = useMemo(() => deriveMilestoneDependencies(tasks), [tasks]);
	const { byMonth, unscheduled } = useMemo(() => storyPointsByMonth(tasks, milestones), [tasks, milestones]);
	const overloaded = useMemo(() => overCapacityMonths(byMonth, pointsPerMonth), [byMonth, pointsPerMonth]);

	const { rangeStart, totalDays } = useMemo(() => {
		let first = today;
		let last = today;
		const include = (day: DayKey) => {
			if (day < first) first = day;
			if (day > last) last = day;
		};
		for (const row of rows) if (row.due) include(row.due);
		for (const month of byMonth.keys()) {
			include(`${month}-01`);
			include(addDays(addMonths(`${month}-01`, 1), -1));
		}
		const rangeStart = addDays(first, -MARGIN_DAYS);
		return { rangeStart, totalDays: daysBetween(rangeStart, addDays(last, MARGIN_DAYS)) + 1 };
	}, [rows, byMonth, today]);

	const dayWidth = DAY_WIDTH[zoom];
	const timelineWidth = totalDays * dayWidth;
	const dayCenter = (day: DayKey) => daysBetween(rangeStart, day) * dayWidth + dayWidth / 2;
	const todayX = dayCenter(today);
	const bands = useMemo(() => monthBands(rangeStart, totalDays), [rangeStart, totalDays]);

	const rowIndex = new Map(rows.map((row, index) => [row.key, index]));
	const arrows = dependencies.flatMap(({ from, to }) => {
		const source = rows[rowIndex.get(from) ?? -1];
		const target = rows[rowIndex.get(to) ?? -1];
		if (!source?.due || !target?.due) return [];
		const x1 = dayCenter(source.due);
		const y1 = (rowIndex.get(from) ?? 0) * ROW_HEIGHT + ROW_HEIGHT / 2;
		const x2 = dayCenter(target.due);
		const y2 = (rowIndex.get(to) ?? 0) * ROW_HEIGHT + ROW_HEIGHT / 2;
		// A milestone due before one it depends on cannot be met as planned.
		const conflict = target.due < source.due;
		const bend = Math.max(40, Math.abs(x2 - x1) / 3);
		return [
			{
				id: `${from}->${to}`,
				label: `${target.milestone.title} depends on ${source.milestone.title}`,
				path: `M ${x1 + 8} ${y1} C ${x1 + 8 + bend} ${y1}, ${x2 - 8 - bend} ${y2}, ${x2 - 8} ${y2}`,
				conflict,
			},
		];
	});

	// Open on today rather than on the oldest milestone, and keep today in view when zooming.
	useLayoutEffect(() => {
		const container = scrollRef.current;
		if (container) container.scrollLeft = Math.max(0, todayX - container.clientWidth / 3);
	}, [todayX]);

	const openMilestones = () => navigate('/milestones');

	return (
		<div className="page-shell">
			<PlanningHeader title="Gantt">
				<div role="group" aria-label="Zoom" className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
					{(Object.keys(DAY_WIDTH) as Zoom[]).map((option) => (
						<button
							key={option}
							type="button"
							aria-pressed={zoom === option}
							onClick={() => setZoom(option)}
							className={`px-3 py-1.5 text-sm font-medium ${
								zoom === option
									? 'bg-blue-600 text-white'
									: 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
							}`}
						>
							{ZOOM_LABELS[option]}
						</button>
					))}
				</div>
			</PlanningHeader>

			{overloaded.length > 0 && (
				<div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
					<span className="font-semibold">Over capacity ({pointsPerMonth} pts/month):</span>{' '}
					{overloaded
						.map((month) => `${formatDay(`${month}-01`, { month: 'short', year: 'numeric' })} (${byMonth.get(month)} pts)`)
						.join(', ')}
				</div>
			)}

			{rows.length === 0 ? (
				<p className="text-sm text-gray-500 dark:text-gray-400">No milestones</p>
			) : (
				<div
					ref={scrollRef}
					className="gantt-chart overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
				>
					<div className="relative" style={{ width: `calc(var(--gantt-label) + ${timelineWidth}px)` }}>
						{/* Header: month bands with their story point totals */}
						<div className="relative z-20 flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
							<div
								className="gantt-label sticky left-0 z-30 flex shrink-0 items-end border-r border-gray-200 bg-gray-50 px-2 pb-1 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
								style={{ height: HEADER_HEIGHT }}
							>
								Milestone
							</div>
							<div className="relative" style={{ width: timelineWidth, height: HEADER_HEIGHT }}>
								{bands.map(({ month, startOffset, days }) => {
									const points = byMonth.get(month) ?? 0;
									const over = overloaded.includes(month);
									return (
										<div
											key={month}
											className={`absolute inset-y-0 overflow-hidden border-l border-gray-300 px-1 dark:border-gray-600 ${over ? 'bg-red-100 dark:bg-red-950/60' : ''}`}
											style={{ left: startOffset * dayWidth, width: days * dayWidth }}
										>
											<div className="truncate text-[11px] font-semibold text-gray-700 dark:text-gray-200">
												{formatDay(`${month}-01`, { month: 'short', year: 'numeric' })}
											</div>
											{points > 0 && (
												<div
													title={pointsPerMonth ? `${points} of ${pointsPerMonth} pts capacity` : `${points} pts`}
													className={`truncate text-[11px] ${over ? 'font-semibold text-red-700 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`}
												>
													{pointsPerMonth ? `${points}/${pointsPerMonth}` : points} pts
												</div>
											)}
										</div>
									);
								})}
							</div>
						</div>

						{/* Today marker spans every row */}
						<div
							aria-hidden="true"
							className="pointer-events-none absolute bottom-0 z-10 w-0.5 bg-blue-500/70"
							style={{ top: HEADER_HEIGHT, left: `calc(var(--gantt-label) + ${todayX}px)` }}
						/>

						{/* Dependency arrows between milestone diamonds */}
						<svg
							aria-hidden="true"
							className="pointer-events-none absolute z-10 overflow-visible"
							style={{ top: HEADER_HEIGHT, left: 'var(--gantt-label)' }}
							width={timelineWidth}
							height={rows.length * ROW_HEIGHT}
						>
							<defs>
								<marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
									<path d="M0,0 L8,4 L0,8 z" className="fill-gray-500 dark:fill-gray-400" />
								</marker>
								<marker id="gantt-arrow-conflict" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
									<path d="M0,0 L8,4 L0,8 z" className="fill-red-500" />
								</marker>
							</defs>
							{arrows.map((arrow) => (
								<path
									key={arrow.id}
									d={arrow.path}
									fill="none"
									strokeWidth={1.5}
									className={arrow.conflict ? 'stroke-red-500' : 'stroke-gray-500 dark:stroke-gray-400'}
									markerEnd={`url(#${arrow.conflict ? 'gantt-arrow-conflict' : 'gantt-arrow'})`}
								>
									<title>{arrow.label}</title>
								</path>
							))}
						</svg>

						{rows.map((row) => {
							const overdue = row.due !== null && row.due < today && !row.completed;
							const points = row.totalPoints > 0 ? `${row.donePoints}/${row.totalPoints} pts` : null;
							return (
								<div key={row.key} className="flex border-b border-gray-100 dark:border-gray-800" style={{ height: ROW_HEIGHT }}>
									<button
										type="button"
										onClick={openMilestones}
										title={row.milestone.title}
										className="gantt-label sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-gray-200 bg-white px-2 text-left hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
									>
										<span className="w-full truncate text-xs font-medium text-gray-800 dark:text-gray-200">{row.milestone.title}</span>
										<span className="w-full truncate text-[11px] text-gray-500 dark:text-gray-400">
											{[row.due ? null : 'No due date', `${row.taskCount} task${row.taskCount === 1 ? '' : 's'}`, points]
												.filter(Boolean)
												.join(' · ')}
										</span>
									</button>
									<div className="relative" style={{ width: timelineWidth }}>
										{row.due && (
											<button
												type="button"
												onClick={openMilestones}
												aria-label={`${row.milestone.title}, due ${row.due}${points ? `, ${points}` : ''}`}
												title={`${row.milestone.title} · due ${row.due}${points ? ` · ${points}` : ''}`}
												className={`absolute z-20 h-3.5 w-3.5 rotate-45 shadow-sm ring-2 ring-white hover:scale-125 focus:outline-none focus:ring-blue-400 dark:ring-gray-900 ${
													row.completed ? 'bg-green-500' : overdue ? 'bg-red-500' : 'bg-blue-600'
												}`}
												style={{ left: dayCenter(row.due) - 7, top: ROW_HEIGHT / 2 - 7 }}
											/>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{unscheduled > 0 && (
				<p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
					{unscheduled} pts have no due date or milestone due date and are not counted in any month.
				</p>
			)}
		</div>
	);
}
