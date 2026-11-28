import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BacklogConfig, Milestone, Task } from "../../types";
import { projectsWithoutFolders } from "../../core/milestone-folders";
import { getProjectValues } from "../../utils/project-config";
import { getTerminalStatus } from "../../utils/terminal-status";
import { apiClient, type TaskUpdateRequest } from "../lib/api";
import { isTaskDone } from "../utils/planning";
import { todayKey } from "./model";

/**
 * Data and actions shared by every part of the task app. Records come from App (which owns
 * loading and live refresh); this layer adds optimistic edits so a checkbox or a drag lands
 * instantly, and a toast for results and errors.
 */

export interface NewTaskInput {
	title: string;
	dueDate?: string;
	priority?: string;
	labels?: string[];
	milestone?: string;
	description?: string;
}

interface Toast {
	id: number;
	message: string;
	undo?: () => void;
}

interface TickStore {
	tasks: Task[];
	milestones: Milestone[];
	statuses: string[];
	priorities: string[];
	projects: string[];
	labels: string[];
	config: BacklogConfig | null;
	projectName: string;
	today: string;
	isDone: (task: Task) => boolean;
	toggleComplete: (task: Task) => void;
	updateTask: (task: Task, patch: TaskUpdateRequest, overlay?: Partial<Task>) => Promise<void>;
	createTask: (input: NewTaskInput) => Promise<Task | null>;
	archiveTask: (task: Task) => Promise<void>;
	createList: (title: string, parent?: string, dueDate?: string) => Promise<Milestone | null>;
	setListParent: (milestone: Milestone, parent: string | null) => Promise<void>;
	renameList: (milestone: Milestone, title: string, dueDate?: string | null) => Promise<void>;
	archiveList: (milestone: Milestone) => Promise<void>;
	/** Configured projects that have no top-level milestone folder yet (the old "areas"). */
	unconvertedProjects: string[];
	convertProjectsToFolders: () => Promise<void>;
	setWebInterface: (value: "app" | "classic") => Promise<boolean>;
	openFullEditor: (task: Task) => void;
	notify: (message: string, undo?: () => void) => void;
	toast: Toast | null;
	dismissToast: () => void;
}

const TickContext = createContext<TickStore | null>(null);

export function useTick(): TickStore {
	const store = useContext(TickContext);
	if (!store) throw new Error("useTick must be used inside TickProvider");
	return store;
}

interface ProviderProps {
	tasks: Task[];
	milestones: Milestone[];
	statuses: string[];
	config: BacklogConfig | null;
	projectName: string;
	onRefresh: () => Promise<void>;
	onRefreshMilestones: () => Promise<void>;
	onOpenFullEditor: (task: Task) => void;
	children: ReactNode;
}

export function TickProvider({
	tasks: sourceTasks,
	milestones,
	statuses,
	config,
	projectName,
	onRefresh,
	onRefreshMilestones,
	onOpenFullEditor,
	children,
}: ProviderProps) {
	// Fields shown before the server confirms them, by task ID. Dropped once the write and the
	// refresh after it finish (or fail), so the server's record always wins in the end.
	const [overlays, setOverlays] = useState<Map<string, Partial<Task>>>(new Map());
	const [toast, setToast] = useState<Toast | null>(null);
	const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [today, setToday] = useState(() => todayKey());

	// Roll "today" over at midnight without a reload.
	useEffect(() => {
		const timer = setInterval(() => setToday(todayKey()), 60_000);
		return () => clearInterval(timer);
	}, []);

	const tasks = useMemo(
		() => (overlays.size === 0 ? sourceTasks : sourceTasks.map((task) => ({ ...task, ...overlays.get(task.id) }))),
		[sourceTasks, overlays],
	);

	const notify = useCallback((message: string, undo?: () => void) => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		const id = Date.now();
		setToast({ id, message, undo });
		toastTimer.current = setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 5000);
	}, []);

	const setOverlay = useCallback((id: string, overlay: Partial<Task> | null) => {
		setOverlays((current) => {
			const next = new Map(current);
			if (overlay) next.set(id, { ...current.get(id), ...overlay });
			else next.delete(id);
			return next;
		});
	}, []);

	const fail = useCallback(
		(error: unknown) => notify(error instanceof Error ? error.message : "Something went wrong"),
		[notify],
	);

	const updateTask = useCallback(
		async (task: Task, patch: TaskUpdateRequest, overlay?: Partial<Task>) => {
			setOverlay(task.id, overlay ?? (patch as Partial<Task>));
			try {
				await apiClient.updateTask(task.id, patch);
				await onRefresh();
			} catch (error) {
				fail(error);
			} finally {
				setOverlay(task.id, null);
			}
		},
		[onRefresh, setOverlay, fail],
	);

	const isDone = useCallback((task: Task) => isTaskDone(task, statuses), [statuses]);

	const toggleComplete = useCallback(
		(task: Task) => {
			const done = isTaskDone(task, statuses);
			const doneStatus = getTerminalStatus(statuses) ?? "Done";
			const openStatus = config?.defaultStatus && config.defaultStatus !== doneStatus ? config.defaultStatus : statuses[0];
			const nextStatus = done ? (openStatus ?? "To Do") : doneStatus;
			const previous = task.status;
			void updateTask(task, { status: nextStatus });
			if (!done) {
				notify(`Completed "${task.title}"`, () => void updateTask({ ...task, status: nextStatus }, { status: previous }));
			}
		},
		[statuses, config, updateTask, notify],
	);

	const createTask = useCallback(
		async (input: NewTaskInput) => {
			try {
				const created = await apiClient.createTask({
					title: input.title,
					status: config?.defaultStatus ?? statuses[0] ?? "To Do",
					assignee: [],
					labels: input.labels ?? [],
					dependencies: [],
					...(input.dueDate ? { dueDate: input.dueDate } : {}),
					...(input.priority ? { priority: input.priority } : {}),
					...(input.milestone ? { milestone: input.milestone } : {}),
					...(input.description ? { description: input.description } : {}),
				} as Omit<Task, "id" | "createdDate">);
				await onRefresh();
				return created;
			} catch (error) {
				fail(error);
				return null;
			}
		},
		[config, statuses, onRefresh, fail],
	);

	const archiveTask = useCallback(
		async (task: Task) => {
			try {
				await apiClient.archiveTask(task.id);
				await onRefresh();
				notify(`Archived "${task.title}"`);
			} catch (error) {
				fail(error);
			}
		},
		[onRefresh, notify, fail],
	);

	const createList = useCallback(
		async (title: string, parent?: string, dueDate?: string) => {
			try {
				const created = await apiClient.createMilestone(title, undefined, dueDate || undefined, parent || undefined);
				await onRefreshMilestones();
				return created;
			} catch (error) {
				fail(error);
				return null;
			}
		},
		[onRefreshMilestones, fail],
	);

	const setListParent = useCallback(
		async (milestone: Milestone, parent: string | null) => {
			try {
				await apiClient.setMilestoneParent(milestone.id, parent);
				await onRefreshMilestones();
			} catch (error) {
				fail(error);
			}
		},
		[onRefreshMilestones, fail],
	);

	const renameList = useCallback(
		async (milestone: Milestone, title: string, dueDate?: string | null) => {
			try {
				await apiClient.updateMilestone(milestone.id, title, dueDate);
				await onRefreshMilestones();
			} catch (error) {
				fail(error);
			}
		},
		[onRefreshMilestones, fail],
	);

	const archiveList = useCallback(
		async (milestone: Milestone) => {
			try {
				await apiClient.archiveMilestone(milestone.id);
				await onRefreshMilestones();
				notify(`Archived list "${milestone.title}"`);
			} catch (error) {
				fail(error);
			}
		},
		[onRefreshMilestones, notify, fail],
	);

	const projects = useMemo(() => getProjectValues(config), [config]);
	const unconvertedProjects = useMemo(() => projectsWithoutFolders(projects, milestones), [projects, milestones]);

	const convertProjectsToFolders = useCallback(async () => {
		try {
			const result = await apiClient.convertProjectsToFolders();
			await Promise.all([onRefreshMilestones(), onRefresh()]);
			notify(
				`Made ${result.createdFolders.length} folders, moved ${result.nestedMilestones.length} lists and ${result.updatedTasks.length} tasks`,
			);
		} catch (error) {
			fail(error);
		}
	}, [onRefresh, onRefreshMilestones, notify, fail]);

	const setWebInterface = useCallback(
		async (value: "app" | "classic") => {
			try {
				await apiClient.updateConfig({ webInterface: value } as BacklogConfig);
				return true;
			} catch (error) {
				fail(error);
				return false;
			}
		},
		[fail],
	);

	const labels = useMemo(() => {
		const all = new Map<string, string>();
		for (const label of config?.labels ?? []) all.set(label.toLowerCase(), label);
		for (const task of sourceTasks) for (const label of task.labels) all.set(label.toLowerCase(), label);
		return [...all.values()].sort((a, b) => a.localeCompare(b));
	}, [config, sourceTasks]);

	const value = useMemo<TickStore>(
		() => ({
			tasks,
			milestones,
			statuses,
			priorities: config?.priorities?.length ? config.priorities : ["high", "medium", "low"],
			projects,
			unconvertedProjects,
			convertProjectsToFolders,
			setWebInterface,
			labels,
			config,
			projectName,
			today,
			isDone,
			toggleComplete,
			updateTask,
			createTask,
			archiveTask,
			createList,
			setListParent,
			renameList,
			archiveList,
			openFullEditor: onOpenFullEditor,
			notify,
			toast,
			dismissToast: () => setToast(null),
		}),
		[
			tasks,
			milestones,
			statuses,
			config,
			labels,
			projectName,
			today,
			isDone,
			toggleComplete,
			updateTask,
			createTask,
			archiveTask,
			createList,
			setListParent,
			renameList,
			archiveList,
			projects,
			unconvertedProjects,
			convertProjectsToFolders,
			setWebInterface,
			onOpenFullEditor,
			notify,
			toast,
		],
	);

	return <TickContext.Provider value={value}>{children}</TickContext.Provider>;
}
