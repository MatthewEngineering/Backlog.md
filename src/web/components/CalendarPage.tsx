import { useMemo } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import type { Milestone, Task } from '../../types';
import {
	addDays,
	addMonths,
	type DayKey,
	formatDay,
	groupTasksByDueDay,
	isTaskDone,
	localDayKey,
	monthGridDays,
	storedDateToDayKey,
	storyPointsByMonth,
	weekDays,
} from '../utils/planning';
import { QuadrantGrid } from './EisenhowerPage';
import { DateNavigator, PlanningHeader, PlanningTaskChip } from './PlanningControls';

export type CalendarView = 'month' | 'week' | 'week-eisenhower';

const VIEW_TABS: { view: CalendarView; label: string; path: string }[] = [
	{ view: 'month', label: 'Month', path: '/calendar' },
	{ view: 'week', label: 'Week', path: '/calendar/week' },
	{ view: 'week-eisenhower', label: 'Week + Eisenhower', path: '/calendar/week-eisenhower' },
];

/** How many chips a month cell shows before collapsing the rest into "+N". */
const MONTH_CELL_LIMIT = 3;

interface CalendarPageProps {
	view: CalendarView;
	tasks: Task[];
	statuses: string[];
	milestones: Milestone[];
	/** Team capacity; the month view warns when its story points exceed it. */
	pointsPerMonth?: number;
	onEditTask: (task: Task) => void;
}

export default function CalendarPage({ view, tasks, statuses, milestones, pointsPerMonth, onEditTask }: CalendarPageProps) {
	const today = localDayKey(new Date());
	// The day the view is anchored on lives in the URL, so a calendar link reopens the same week.
	const [searchParams, setSearchParams] = useSearchParams();
	const anchor = storedDateToDayKey(searchParams.get('date') ?? undefined) ?? today;
	const setAnchor = (day: DayKey) => {
		const next = new URLSearchParams(searchParams);
		if (day === today) next.delete('date');
		else next.set('date', day);
		setSearchParams(next, { replace: true });
	};
	const tasksByDay = useMemo(() => groupTasksByDueDay(tasks), [tasks]);
	const pointsByMonth = useMemo(() => storyPointsByMonth(tasks, milestones).byMonth, [tasks, milestones]);
	const isMonth = view === 'month';
	const step = (direction: 1 | -1) => setAnchor(isMonth ? addMonths(anchor, direction) : addDays(anchor, 7 * direction));
	const days = isMonth ? monthGridDays(anchor) : weekDays(anchor);
	const label = isMonth
		? formatDay(anchor, { month: 'long', year: 'numeric' })
		: `${formatDay(days[0]!, { day: 'numeric', month: 'short' })} – ${formatDay(days[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}`;

	return (
		<div className="page-shell">
			<PlanningHeader title="Calendar">
				<nav aria-label="Calendar views" className="flex w-full overflow-x-auto rounded-lg border border-gray-300 dark:border-gray-600 sm:w-auto">
					{VIEW_TABS.map((tab) => (
						<NavLink
							key={tab.view}
							to={{ pathname: tab.path, search: searchParams.toString() }}
							end
							className={({ isActive }) =>
								`flex-1 whitespace-nowrap px-3 py-2 text-center text-sm font-medium transition-colors ${
									isActive
										? 'bg-blue-600 text-white'
										: 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
								}`
							}
						>
							{tab.label}
						</NavLink>
					))}
				</nav>
			</PlanningHeader>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
				<DateNavigator
					label={label}
					onPrevious={() => step(-1)}
					onToday={() => setAnchor(today)}
					onNext={() => step(1)}
					previousLabel={isMonth ? 'Previous month' : 'Previous week'}
					nextLabel={isMonth ? 'Next month' : 'Next week'}
				/>
				{isMonth && <MonthPoints points={pointsByMonth.get(anchor.slice(0, 7)) ?? 0} capacity={pointsPerMonth} />}
			</div>
			{view === 'month' && (
				<MonthView
					days={days}
					anchor={anchor}
					today={today}
					tasksByDay={tasksByDay}
					statuses={statuses}
					onSelectDay={setAnchor}
					onEditTask={onEditTask}
				/>
			)}
			{view === 'week' && (
				<WeekView days={days} today={today} tasksByDay={tasksByDay} statuses={statuses} onEditTask={onEditTask} />
			)}
			{view === 'week-eisenhower' && (
				<WeekEisenhowerView days={days} today={today} tasksByDay={tasksByDay} statuses={statuses} onEditTask={onEditTask} />
			)}
		</div>
	);
}

/** The month's story points against the team capacity; red with a warning when over. */
function MonthPoints({ points, capacity }: { points: number; capacity?: number }) {
	if (points === 0 && !capacity) return null;
	const over = Boolean(capacity && points > capacity);
	return (
		<span
			role={over ? 'alert' : undefined}
			className={`rounded-lg px-3 py-1 text-sm font-medium ${
				over
					? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
					: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
			}`}
		>
			{over && '⚠ Over capacity: '}
			{capacity ? `${points} / ${capacity}` : points} pts
		</span>
	);
}

interface DayViewProps {
	days: DayKey[];
	today: DayKey;
	tasksByDay: Map<DayKey, Task[]>;
	statuses: string[];
	onEditTask: (task: Task) => void;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MonthView({
	days,
	anchor,
	today,
	tasksByDay,
	statuses,
	onSelectDay,
	onEditTask,
}: DayViewProps & { anchor: DayKey; onSelectDay: (day: DayKey) => void }) {
	const month = anchor.slice(0, 7);
	const selectedTasks = tasksByDay.get(anchor) ?? [];
	return (
		<div className="space-y-4">
			<div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
				<div className="grid grid-cols-7 border-b border-gray-200 bg-gray-100 text-center text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
					{WEEKDAY_LABELS.map((weekday) => (
						<div key={weekday} className="py-2">
							{weekday}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7">
					{days.map((day) => {
						const dayTasks = tasksByDay.get(day) ?? [];
						const inMonth = day.startsWith(month);
						const isSelected = day === anchor;
						return (
							// A cell is a day picker; its chips open tasks. The chip list is hidden on small
							// screens, where the cell shows a count and the selected day's list below does the rest.
							<div
								key={day}
								className={`min-h-14 min-w-0 border-b border-r border-gray-200 p-1 dark:border-gray-700 md:min-h-28 ${
									inMonth ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'
								} ${isSelected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
							>
								<button
									type="button"
									onClick={() => onSelectDay(day)}
									aria-label={`${formatDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}, ${dayTasks.length} tasks`}
									aria-pressed={isSelected}
									className="flex w-full items-center justify-between rounded px-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
								>
									<span
										className={`inline-flex h-6 w-6 items-center justify-center rounded-circle ${
											day === today
												? 'bg-blue-600 font-semibold text-white'
												: inMonth
													? 'text-gray-800 dark:text-gray-200'
													: 'text-gray-400 dark:text-gray-500'
										}`}
									>
										{Number(day.slice(8))}
									</span>
									{dayTasks.length > 0 && (
										<span className="rounded-circle bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 md:hidden">
											{dayTasks.length}
										</span>
									)}
								</button>
								<div className="mt-1 hidden space-y-1 md:block">
									{dayTasks.slice(0, MONTH_CELL_LIMIT).map((task) => (
										<PlanningTaskChip
											key={task.id}
											task={task}
											done={isTaskDone(task, statuses)}
											onOpen={onEditTask}
											compact
										/>
									))}
									{dayTasks.length > MONTH_CELL_LIMIT && (
										<button
											type="button"
											onClick={() => onSelectDay(day)}
											className="px-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
										>
											+{dayTasks.length - MONTH_CELL_LIMIT} more
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
			<section aria-label="Selected day">
				<h2 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
					{formatDay(anchor, { weekday: 'long', day: 'numeric', month: 'long' })}
				</h2>
				{selectedTasks.length === 0 ? (
					<p className="text-sm text-gray-500 dark:text-gray-400">Nothing due</p>
				) : (
					<div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
						{selectedTasks.map((task) => (
							<PlanningTaskChip key={task.id} task={task} done={isTaskDone(task, statuses)} onOpen={onEditTask} />
						))}
					</div>
				)}
			</section>
		</div>
	);
}

function DayHeading({ day, today }: { day: DayKey; today: DayKey }) {
	return (
		<h2
			className={`mb-2 flex items-baseline gap-2 text-sm font-semibold ${
				day === today ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'
			}`}
		>
			{formatDay(day, { weekday: 'short' })}
			<span className="text-xs font-normal text-gray-500 dark:text-gray-400">{formatDay(day, { day: 'numeric', month: 'short' })}</span>
		</h2>
	);
}

/** Seven columns on wide screens, one day per row on phones. */
function WeekView({ days, today, tasksByDay, statuses, onEditTask }: DayViewProps) {
	return (
		<div className="grid gap-2 lg:grid-cols-7">
			{days.map((day) => {
				const dayTasks = tasksByDay.get(day) ?? [];
				return (
					<section
						key={day}
						className={`min-w-0 rounded-lg border p-2 lg:min-h-80 ${
							day === today
								? 'border-blue-400 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/20'
								: 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
						}`}
					>
						<DayHeading day={day} today={today} />
						<div className="space-y-1">
							{dayTasks.length === 0 ? (
								<p className="text-xs text-gray-400 dark:text-gray-500">—</p>
							) : (
								dayTasks.map((task) => (
									<PlanningTaskChip key={task.id} task={task} done={isTaskDone(task, statuses)} onOpen={onEditTask} />
								))
							)}
						</div>
					</section>
				);
			})}
		</div>
	);
}

/**
 * Each day as its own 2x2 priority matrix. A 2x2 needs more width than a seventh of most screens,
 * so the days wrap: one per row on phones, up to seven across on very wide screens.
 */
function WeekEisenhowerView({ days, today, tasksByDay, statuses, onEditTask }: DayViewProps) {
	return (
		<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
			{days.map((day) => (
				<section
					key={day}
					className={`min-w-0 rounded-lg border bg-white p-2 dark:bg-gray-900 ${
						day === today ? 'border-blue-400 dark:border-blue-500' : 'border-gray-200 dark:border-gray-700'
					}`}
				>
					<DayHeading day={day} today={today} />
					<QuadrantGrid tasks={tasksByDay.get(day) ?? []} statuses={statuses} onEditTask={onEditTask} compact />
				</section>
			))}
		</div>
	);
}
