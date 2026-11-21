import { useMemo } from 'react';
import type { Task } from '../../types';
import { EISENHOWER_QUADRANTS, dueDayKey, groupTasksByQuadrant, isTaskDone } from '../utils/planning';
import { PlanningHeader, PlanningTaskChip, QUADRANT_TINT } from './PlanningControls';

interface QuadrantGridProps {
	tasks: Task[];
	statuses: string[];
	onEditTask: (task: Task) => void;
	/** Small variant for a single day inside the week view. */
	compact?: boolean;
}

/** Due-dated tasks first (soonest first), then the rest by ID. */
function byDueThenId(a: Task, b: Task): number {
	const aDue = dueDayKey(a);
	const bDue = dueDayKey(b);
	if (aDue && bDue && aDue !== bDue) return aDue < bDue ? -1 : 1;
	if (aDue && !bDue) return -1;
	if (!aDue && bDue) return 1;
	return a.id.localeCompare(b.id, undefined, { numeric: true });
}

/** High and medium across the top, low and no priority across the bottom. */
export function QuadrantGrid({ tasks, statuses, onEditTask, compact = false }: QuadrantGridProps) {
	const groups = useMemo(() => groupTasksByQuadrant([...tasks].sort(byDueThenId)), [tasks]);
	return (
		<div className={`grid grid-cols-2 ${compact ? 'gap-1' : 'gap-3 md:gap-4'}`}>
			{EISENHOWER_QUADRANTS.map(({ key, label }) => (
				<section
					key={key}
					aria-label={`${label} priority`}
					className={`min-w-0 rounded-lg border ${QUADRANT_TINT[key]} ${compact ? 'p-1.5' : 'p-3 md:p-4 min-h-40 md:min-h-56'}`}
				>
					<h2
						className={`mb-2 flex items-center justify-between font-semibold text-gray-800 dark:text-gray-200 ${compact ? 'text-[11px]' : 'text-sm'}`}
					>
						<span className="truncate">{label}</span>
						<span className="ml-2 text-gray-500 dark:text-gray-400">{groups[key].length}</span>
					</h2>
					<div className="space-y-1">
						{groups[key].map((task) => (
							<PlanningTaskChip
								key={task.id}
								task={task}
								done={isTaskDone(task, statuses)}
								onOpen={onEditTask}
								compact={compact}
							/>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

interface EisenhowerPageProps {
	tasks: Task[];
	statuses: string[];
	onEditTask: (task: Task) => void;
}

export default function EisenhowerPage({ tasks, statuses, onEditTask }: EisenhowerPageProps) {
	const openTasks = useMemo(() => tasks.filter((task) => !isTaskDone(task, statuses)), [tasks, statuses]);
	return (
		<div className="page-shell">
			<PlanningHeader title="Eisenhower Matrix" />
			<QuadrantGrid tasks={openTasks} statuses={statuses} onEditTask={onEditTask} />
		</div>
	);
}
