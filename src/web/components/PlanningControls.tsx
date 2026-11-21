import type { ReactNode } from 'react';
import type { Task } from '../../types';
import { eisenhowerQuadrant, type EisenhowerQuadrant } from '../utils/planning';

/** Same priority colours as the kanban cards. */
export const QUADRANT_BORDER: Record<EisenhowerQuadrant, string> = {
	high: 'border-l-red-500 dark:border-l-red-400',
	medium: 'border-l-yellow-500 dark:border-l-yellow-400',
	low: 'border-l-green-500 dark:border-l-green-400',
	none: 'border-l-gray-300 dark:border-l-gray-600',
};

export const QUADRANT_TINT: Record<EisenhowerQuadrant, string> = {
	high: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
	medium: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900',
	low: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900',
	none: 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700',
};

interface PlanningTaskChipProps {
	task: Task;
	done: boolean;
	onOpen: (task: Task) => void;
	/** Hide the ID to fit very narrow cells. */
	compact?: boolean;
}

export function PlanningTaskChip({ task, done, onOpen, compact = false }: PlanningTaskChipProps) {
	return (
		<button
			type="button"
			onClick={() => onOpen(task)}
			title={`${task.id} · ${task.title} · ${task.status}`}
			className={`block w-full min-w-0 rounded border border-gray-200 border-l-4 bg-white px-2 py-1 text-left text-xs transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 ${QUADRANT_BORDER[eisenhowerQuadrant(task)]} ${done ? 'opacity-60' : ''}`}
		>
			<span className={`block truncate text-gray-900 dark:text-gray-100 ${done ? 'line-through' : ''}`}>
				{!compact && <span className="mr-1 font-mono text-gray-500 dark:text-gray-400">{task.id}</span>}
				{task.title}
			</span>
		</button>
	);
}

interface DateNavigatorProps {
	label: string;
	onPrevious: () => void;
	onToday: () => void;
	onNext: () => void;
	previousLabel: string;
	nextLabel: string;
}

const navButton =
	'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

export function DateNavigator({ label, onPrevious, onToday, onNext, previousLabel, nextLabel }: DateNavigatorProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<button type="button" className={navButton} onClick={onPrevious} aria-label={previousLabel}>
				‹
			</button>
			<button type="button" className={navButton} onClick={onToday}>
				Today
			</button>
			<button type="button" className={navButton} onClick={onNext} aria-label={nextLabel}>
				›
			</button>
			<span className="ml-1 text-base font-semibold text-gray-900 dark:text-gray-100">{label}</span>
		</div>
	);
}

/** Page title row shared by the planning pages; wraps under the title on narrow screens. */
export function PlanningHeader({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
			{children}
		</div>
	);
}
