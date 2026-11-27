import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { milestoneKey } from "../../core/milestones";
import type { Milestone, Task } from "../../types";
import {
	IconAll,
	IconCaret,
	IconDone,
	IconFolder,
	IconInbox,
	IconList,
	IconMore,
	IconPlus,
	IconSun,
	IconTag,
	IconWeek,
} from "./icons";
import { buildListTree, type ListNode, milestoneArea, tasksForView, type ViewSpec } from "./model";
import { Popover, taskDropHandlers } from "./parts";
import { useTick } from "./store";

const LIST_DRAG_TYPE = "application/x-backlog-list";

/** Stable soft colour per list, like TickTick's list colours. */
const LIST_COLORS = ["#4772fa", "#ff6161", "#ffb000", "#35c28f", "#a26bfa", "#00b5d8", "#f06aa8", "#8d9aa6"];
function listColor(id: string): string {
	let hash = 0;
	for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return LIST_COLORS[hash % LIST_COLORS.length] as string;
}

export function viewPath(view: ViewSpec): string {
	switch (view.kind) {
		case "list":
			return `/app/list/${encodeURIComponent(view.milestoneId)}`;
		case "area":
			return `/app/area/${encodeURIComponent(view.project)}`;
		case "tag":
			return `/app/tag/${encodeURIComponent(view.label)}`;
		case "search":
			return `/app/search?q=${encodeURIComponent(view.query)}`;
		default:
			return `/app/${view.kind}`;
	}
}

function sameView(a: ViewSpec | null, b: ViewSpec): boolean {
	return a !== null && viewPath(a) === viewPath(b);
}

interface SidebarProps {
	current: ViewSpec | null;
	onNavigate?: () => void;
}

type ListDialog =
	| { mode: "create"; parent?: string }
	| { mode: "edit"; milestone: Milestone };

export default function Sidebar({ current, onNavigate }: SidebarProps) {
	const store = useTick();
	const { tasks, milestones, statuses, today, projects, labels, isDone, updateTask, setListParent } = store;
	const [collapsed, setCollapsed] = useState<Set<string>>(() => {
		try {
			return new Set(JSON.parse(localStorage.getItem("tt-collapsed") ?? "[]") as string[]);
		} catch {
			return new Set();
		}
	});
	const [dialog, setDialog] = useState<ListDialog | null>(null);
	const [menuFor, setMenuFor] = useState<string | null>(null);

	const toggle = (key: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			try {
				localStorage.setItem("tt-collapsed", JSON.stringify([...next]));
			} catch {
				// Remembering folds is a convenience.
			}
			return next;
		});

	const context = { statuses, today, milestones };
	const openCount = (view: ViewSpec) => tasksForView(tasks, view, context).filter((task) => !isDone(task)).length;

	const tree = useMemo(() => buildListTree(milestones), [milestones]);
	// Top-level lists go into their area's folder; nested lists follow their parent.
	const { byArea, unfiled } = useMemo(() => {
		const byArea = new Map<string, ListNode[]>();
		const unfiled: ListNode[] = [];
		for (const node of tree) {
			const area = milestoneArea(node.milestone, tasks, projects);
			if (area) byArea.set(area, [...(byArea.get(area) ?? []), node]);
			else unfiled.push(node);
		}
		return { byArea, unfiled };
	}, [tree, tasks, projects]);

	const smart: Array<{ view: ViewSpec; label: string; icon: ReactNode; onDrop?: (task: Task) => void }> = [
		{
			view: { kind: "today" },
			label: "Today",
			icon: <IconSun />,
			onDrop: (task) => void updateTask(task, { dueDate: today }, { dueDate: today }),
		},
		{ view: { kind: "next7" }, label: "Next 7 Days", icon: <IconWeek /> },
		{
			view: { kind: "inbox" },
			label: "Inbox",
			icon: <IconInbox />,
			onDrop: (task) => void updateTask(task, { milestone: null }, { milestone: undefined }),
		},
		{ view: { kind: "all" }, label: "All", icon: <IconAll /> },
	];

	const listDropHandlers = (target: Milestone | null) => ({
		onDragOver: (event: React.DragEvent<HTMLElement>) => {
			if (!event.dataTransfer.types.includes(LIST_DRAG_TYPE)) return;
			event.preventDefault();
			event.currentTarget.classList.add("is-drop");
		},
		onDragLeave: (event: React.DragEvent<HTMLElement>) => event.currentTarget.classList.remove("is-drop"),
		onDrop: (event: React.DragEvent<HTMLElement>) => {
			event.currentTarget.classList.remove("is-drop");
			const id = event.dataTransfer.getData(LIST_DRAG_TYPE);
			const moving = milestones.find((milestone) => milestone.id === id);
			if (!moving) return;
			event.preventDefault();
			if (target && milestoneKey(target.id) === milestoneKey(moving.id)) return;
			void setListParent(moving, target ? target.id : null);
		},
	});

	/** One element can take both task drops (move the task) and list drops (nest the list). */
	const combine = (
		taskHandlers: ReturnType<typeof taskDropHandlers> | null,
		listHandlers: ReturnType<typeof listDropHandlers> | null,
	) => ({
		onDragOver: (event: React.DragEvent<HTMLElement>) => {
			taskHandlers?.onDragOver(event);
			listHandlers?.onDragOver(event);
		},
		onDragLeave: (event: React.DragEvent<HTMLElement>) => {
			taskHandlers?.onDragLeave(event);
			listHandlers?.onDragLeave(event);
		},
		onDrop: (event: React.DragEvent<HTMLElement>) => {
			taskHandlers?.onDrop(event);
			listHandlers?.onDrop(event);
		},
	});

	const renderList = (node: ListNode): ReactNode => {
		const { milestone } = node;
		const view: ViewSpec = { kind: "list", milestoneId: milestone.id };
		const key = `list:${milestone.id}`;
		const hasChildren = node.children.length > 0;
		const isCollapsed = collapsed.has(key);
		return (
			<div key={milestone.id}>
				<Link
					to={viewPath(view)}
					onClick={onNavigate}
					className={`tt-nav-item ${sameView(current, view) ? "is-active" : ""}`}
					style={{ paddingLeft: 10 + node.depth * 16 }}
					draggable
					onDragStart={(event) => {
						event.dataTransfer.setData(LIST_DRAG_TYPE, milestone.id);
						event.dataTransfer.effectAllowed = "move";
					}}
					{...combine(
						taskDropHandlers(
							(task) => void updateTask(task, { milestone: milestone.id }, { milestone: milestone.id }),
							tasks,
						),
						listDropHandlers(milestone),
					)}
				>
					<span
						className={`tt-caret ${isCollapsed ? "" : "is-open"}`}
						style={{ visibility: hasChildren ? "visible" : "hidden" }}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							toggle(key);
						}}
					>
						<IconCaret />
					</span>
					<span className="tt-nav-icon" style={{ color: listColor(milestone.id) }}>
						<IconList size={16} />
					</span>
					<span className="tt-nav-label" title={milestone.title}>
						{milestone.title}
					</span>
					<span
						className="tt-nav-more"
						role="button"
						aria-label={`${milestone.title} options`}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setMenuFor(menuFor === milestone.id ? null : milestone.id);
						}}
					>
						<IconMore size={14} />
					</span>
					<span className="tt-nav-count">{openCount(view) || ""}</span>
					{menuFor === milestone.id && (
						<ListMenu
							milestone={milestone}
							onClose={() => setMenuFor(null)}
							onAddChild={() => setDialog({ mode: "create", parent: milestone.id })}
							onEdit={() => setDialog({ mode: "edit", milestone })}
						/>
					)}
				</Link>
				{hasChildren && !isCollapsed && node.children.map(renderList)}
			</div>
		);
	};

	return (
		<nav className="tt-sidebar" aria-label="Lists">
			<div className="tt-sidebar-scroll">
				{smart.map(({ view, label, icon, onDrop }) => (
					<Link
						key={view.kind}
						to={viewPath(view)}
						onClick={onNavigate}
						className={`tt-nav-item ${sameView(current, view) ? "is-active" : ""}`}
						{...(onDrop ? taskDropHandlers(onDrop, tasks) : {})}
					>
						<span className="tt-nav-icon">{icon}</span>
						<span className="tt-nav-label">{label}</span>
						<span className="tt-nav-count">{openCount(view) || ""}</span>
					</Link>
				))}

				<div className="tt-section">
					<div className="tt-section-head" onClick={() => toggle("section:lists")} {...listDropHandlers(null)}>
						<span className={`tt-caret ${collapsed.has("section:lists") ? "" : "is-open"}`}>
							<IconCaret />
						</span>
						<span className="tt-section-title">Lists</span>
						<span
							className="tt-icon-btn"
							role="button"
							aria-label="Add list"
							title="Add list"
							onClick={(event) => {
								event.stopPropagation();
								setDialog({ mode: "create" });
							}}
						>
							<IconPlus size={14} />
						</span>
					</div>
					{!collapsed.has("section:lists") && (
						<>
							{projects.map((project) => {
								const view: ViewSpec = { kind: "area", project };
								const key = `area:${project}`;
								const lists = byArea.get(project) ?? [];
								const isCollapsed = collapsed.has(key);
								return (
									<div key={project}>
										<Link
											to={viewPath(view)}
											onClick={onNavigate}
											className={`tt-nav-item ${sameView(current, view) ? "is-active" : ""}`}
											{...taskDropHandlers(
												(task) => void updateTask(task, { project }, { project }),
												tasks,
											)}
										>
											<span
												className={`tt-caret ${isCollapsed ? "" : "is-open"}`}
												style={{ visibility: lists.length ? "visible" : "hidden" }}
												onClick={(event) => {
													event.preventDefault();
													event.stopPropagation();
													toggle(key);
												}}
											>
												<IconCaret />
											</span>
											<span className="tt-nav-icon">
												<IconFolder size={16} />
											</span>
											<span className="tt-nav-label">{project}</span>
											<span className="tt-nav-count">{openCount(view) || ""}</span>
										</Link>
										{!isCollapsed &&
											lists.map((node) => renderList({ ...node, depth: node.depth + 1, children: bump(node.children) }))}
									</div>
								);
							})}
							{unfiled.map(renderList)}
							{milestones.length === 0 && (
								<div className="tt-empty-group" style={{ paddingLeft: 12 }}>
									Lists are milestones. Add one with +, nest it by dragging it onto another.
								</div>
							)}
						</>
					)}
				</div>

				{labels.length > 0 && (
					<div className="tt-section">
						<div className="tt-section-head" onClick={() => toggle("section:tags")}>
							<span className={`tt-caret ${collapsed.has("section:tags") ? "" : "is-open"}`}>
								<IconCaret />
							</span>
							<span className="tt-section-title">Tags</span>
						</div>
						{!collapsed.has("section:tags") &&
							labels.map((label) => {
								const view: ViewSpec = { kind: "tag", label };
								return (
									<Link
										key={label}
										to={viewPath(view)}
										onClick={onNavigate}
										className={`tt-nav-item ${sameView(current, view) ? "is-active" : ""}`}
										{...taskDropHandlers((task) => {
											if (task.labels.some((existing) => existing.toLowerCase() === label.toLowerCase())) return;
											const next = [...task.labels, label];
											void updateTask(task, { labels: next }, { labels: next });
										}, tasks)}
									>
										<span className="tt-nav-icon">
											<IconTag size={16} />
										</span>
										<span className="tt-nav-label">{label}</span>
										<span className="tt-nav-count">{openCount(view) || ""}</span>
									</Link>
								);
							})}
					</div>
				)}

				<div className="tt-section">
					<Link
						to={viewPath({ kind: "completed" })}
						onClick={onNavigate}
						className={`tt-nav-item ${sameView(current, { kind: "completed" }) ? "is-active" : ""}`}
					>
						<span className="tt-nav-icon">
							<IconDone />
						</span>
						<span className="tt-nav-label">Completed</span>
					</Link>
				</div>
			</div>
			{dialog && <ListDialogView dialog={dialog} onClose={() => setDialog(null)} />}
		</nav>
	);
}

/** Shift a subtree one level deeper (lists shown inside an area folder). */
function bump(nodes: ListNode[]): ListNode[] {
	return nodes.map((node) => ({ ...node, depth: node.depth + 1, children: bump(node.children) }));
}

function ListMenu({
	milestone,
	onClose,
	onAddChild,
	onEdit,
}: {
	milestone: Milestone;
	onClose: () => void;
	onAddChild: () => void;
	onEdit: () => void;
}) {
	const { setListParent, archiveList } = useTick();
	const run = (action: () => void) => (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		onClose();
		action();
	};
	return (
		<Popover onClose={onClose} style={{ left: 40, top: 32 }}>
			<button type="button" className="tt-menu-item" onClick={run(onAddChild)}>
				Add sub-list
			</button>
			<button type="button" className="tt-menu-item" onClick={run(onEdit)}>
				Edit
			</button>
			{milestone.parent && (
				<button type="button" className="tt-menu-item" onClick={run(() => void setListParent(milestone, null))}>
					Move to top level
				</button>
			)}
			<div className="tt-menu-sep" />
			<button
				type="button"
				className="tt-menu-item is-danger"
				onClick={run(() => {
					if (window.confirm(`Archive the list "${milestone.title}"? Its tasks stay; they just leave the list.`)) {
						void archiveList(milestone);
					}
				})}
			>
				Archive list
			</button>
		</Popover>
	);
}

function ListDialogView({ dialog, onClose }: { dialog: ListDialog; onClose: () => void }) {
	const { milestones, createList, renameList, setListParent } = useTick();
	const editing = dialog.mode === "edit" ? dialog.milestone : null;
	const [title, setTitle] = useState(editing?.title ?? "");
	const [parent, setParent] = useState(editing?.parent ?? (dialog.mode === "create" ? (dialog.parent ?? "") : ""));
	const [dueDate, setDueDate] = useState(editing?.dueDate ?? "");
	const [busy, setBusy] = useState(false);

	// A list cannot move under itself or anything nested in it.
	const blocked = useMemo(() => {
		if (!editing) return new Set<string>();
		const blockedKeys = new Set<string>([milestoneKey(editing.id)]);
		let grew = true;
		while (grew) {
			grew = false;
			for (const milestone of milestones) {
				if (milestone.parent && blockedKeys.has(milestoneKey(milestone.parent)) && !blockedKeys.has(milestoneKey(milestone.id))) {
					blockedKeys.add(milestoneKey(milestone.id));
					grew = true;
				}
			}
		}
		return blockedKeys;
	}, [editing, milestones]);

	const options: Array<{ id: string; label: string }> = [];
	const walk = (node: ListNode) => {
		if (blocked.has(milestoneKey(node.milestone.id))) return;
		options.push({ id: node.milestone.id, label: `${"   ".repeat(node.depth)}${node.milestone.title}` });
		node.children.forEach(walk);
	};
	buildListTree(milestones).forEach(walk);

	const submit = async () => {
		if (!title.trim() || busy) return;
		setBusy(true);
		if (editing) {
			if (title.trim() !== editing.title || (dueDate || undefined) !== editing.dueDate) {
				await renameList(editing, title.trim(), dueDate || null);
			}
			if ((parent || undefined) !== editing.parent) {
				await setListParent(editing, parent || null);
			}
		} else {
			await createList(title.trim(), parent || undefined, dueDate || undefined);
		}
		setBusy(false);
		onClose();
	};

	return (
		<div className="tt-modal-backdrop" onMouseDown={onClose}>
			<form
				className="tt-modal"
				onMouseDown={(event) => event.stopPropagation()}
				onSubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<h2>{editing ? "Edit List" : "Add List"}</h2>
				<label htmlFor="tt-list-name">Name</label>
				<input
					id="tt-list-name"
					className="tt-input"
					autoFocus
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="List name"
				/>
				<label htmlFor="tt-list-parent">Inside list</label>
				<select id="tt-list-parent" className="tt-input" value={parent} onChange={(event) => setParent(event.target.value)}>
					<option value="">None (top level)</option>
					{options.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
				<label htmlFor="tt-list-due">Due date (milestone)</label>
				<input
					id="tt-list-due"
					type="date"
					className="tt-input"
					value={dueDate}
					onChange={(event) => setDueDate(event.target.value)}
				/>
				<div className="tt-modal-actions">
					<button type="button" className="tt-btn" onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className="tt-btn is-primary" disabled={!title.trim() || busy}>
						{editing ? "Save" : "Add"}
					</button>
				</div>
			</form>
		</div>
	);
}
