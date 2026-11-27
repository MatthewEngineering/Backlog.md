import { useEffect, useMemo, useState } from "react";
import { type AcceptanceCriterion, isReadOnlyTask, type Task } from "../../types";
import { apiClient } from "../lib/api";
import { dueDayKey } from "../utils/planning";
import { IconCalendar, IconClose, IconExpand, IconFlag, IconTrash } from "./icons";
import { buildListTree, type ListNode, priorityLevel, relativeDayLabel } from "./model";
import { Checkbox, DatePicker, PRIORITY_COLOR, PriorityPicker } from "./parts";
import { useTick } from "./store";

interface TaskDetailProps {
	task: Task | null;
	onClose: () => void;
}

/** Flatten the list tree into indented <option>s. */
function listOptions(nodes: ListNode[]): Array<{ id: string; label: string }> {
	const options: Array<{ id: string; label: string }> = [];
	const walk = (node: ListNode) => {
		options.push({ id: node.milestone.id, label: `${"   ".repeat(node.depth)}${node.milestone.title}` });
		for (const child of node.children) walk(child);
	};
	for (const node of nodes) walk(node);
	return options;
}

export default function TaskDetail({ task, onClose }: TaskDetailProps) {
	if (!task) {
		return (
			<aside className="tt-detail is-empty" aria-label="Task details">
				<div className="tt-detail-empty">
					<div>
						<div style={{ fontSize: 44, marginBottom: 8 }}>☰</div>
						Click a task title to view the detail
					</div>
				</div>
			</aside>
		);
	}
	return <TaskDetailBody key={task.id} task={task} onClose={onClose} />;
}

/** The list record's defined fields, which carry optimistic edits, over the full detail read. */
function useFullTask(base: Task): Task {
	const [full, setFull] = useState<Task | null>(null);
	useEffect(() => {
		let active = true;
		apiClient
			.fetchTask(base.id)
			.then((detail) => active && setFull(detail))
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [base.id, base.updatedDate, base.revision]);
	return useMemo(() => {
		if (!full) return base;
		const defined = Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined));
		return { ...full, ...defined } as Task;
	}, [full, base]);
}

function TaskDetailBody({ task: base, onClose }: { task: Task; onClose: () => void }) {
	const task = useFullTask(base);
	const { milestones, statuses, projects, today, updateTask, archiveTask, openFullEditor } = useTick();
	const readOnly = isReadOnlyTask(task);
	const [title, setTitle] = useState(task.title);
	const [description, setDescription] = useState(task.description ?? "");
	const [picker, setPicker] = useState<"date" | "priority" | null>(null);
	const [newItem, setNewItem] = useState("");
	const [newTag, setNewTag] = useState("");

	// A refresh with a newer record replaces the draft text only when the field is not being edited.
	useEffect(() => {
		if (document.activeElement?.getAttribute("data-field") !== "title") setTitle(task.title);
	}, [task.title]);
	useEffect(() => {
		if (document.activeElement?.getAttribute("data-field") !== "description") setDescription(task.description ?? "");
	}, [task.description]);

	const options = useMemo(() => listOptions(buildListTree(milestones)), [milestones]);
	const due = dueDayKey(task);
	const level = priorityLevel(task);
	const checklist: AcceptanceCriterion[] = task.acceptanceCriteriaItems ?? [];

	const saveTitle = (value: string) => {
		const next = value.replace(/\n/g, " ").trim();
		if (next && next !== task.title) void updateTask(task, { title: next });
		else setTitle(task.title);
	};
	const saveDescription = (value: string) => {
		if (value !== (task.description ?? "")) void updateTask(task, { description: value });
	};
	const saveChecklist = (items: Array<{ text: string; checked: boolean }>) => {
		const acceptanceCriteriaItems = items.map((item, index) => ({ ...item, index: index + 1 }));
		void updateTask(task, { acceptanceCriteriaItems }, { acceptanceCriteriaItems });
	};
	const setTags = (labels: string[]) => void updateTask(task, { labels }, { labels });

	return (
		<aside className="tt-detail" aria-label="Task details">
			<div className="tt-detail-top">
				<Checkbox task={task} />
				<div style={{ width: 1, height: 18, background: "var(--tt-border)" }} />
				<div style={{ position: "relative", flex: 1 }}>
					<button
						type="button"
						className="tt-detail-date"
						disabled={readOnly}
						onClick={() => setPicker(picker === "date" ? null : "date")}
						style={due ? { color: due < today ? "var(--tt-overdue)" : "var(--tt-accent)" } : undefined}
					>
						<IconCalendar size={16} />
						{due ? relativeDayLabel(due, today) : "Due date"}
					</button>
					{picker === "date" && (
						<DatePicker
							value={due}
							style={{ top: 34, left: 0 }}
							onClose={() => setPicker(null)}
							onChange={(day) => void updateTask(task, { dueDate: day }, { dueDate: day ?? undefined })}
						/>
					)}
				</div>
				<div style={{ position: "relative" }}>
					<button
						type="button"
						className="tt-icon-btn"
						aria-label="Priority"
						title="Priority"
						disabled={readOnly}
						onClick={() => setPicker(picker === "priority" ? null : "priority")}
					>
						<IconFlag color={PRIORITY_COLOR[level]} />
					</button>
					{picker === "priority" && (
						<PriorityPicker
							value={task.priority}
							style={{ top: 30, right: 0 }}
							onClose={() => setPicker(null)}
							onChange={(priority) => void updateTask(task, { priority }, { priority: priority || undefined })}
						/>
					)}
				</div>
				<button type="button" className="tt-icon-btn" aria-label="Close details" onClick={onClose}>
					<IconClose size={16} />
				</button>
			</div>

			<div className="tt-detail-body">
				<textarea
					className="tt-detail-title"
					data-field="title"
					rows={1}
					value={title}
					readOnly={readOnly}
					placeholder="What would you like to do?"
					onChange={(event) => setTitle(event.target.value.replace(/\n/g, " "))}
					onBlur={(event) => saveTitle(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
						}
					}}
				/>

				{checklist.length > 0 || !readOnly ? (
					<div style={{ marginBottom: 10 }}>
						{checklist.map((item, index) => (
							<div key={`${index}-${item.text}`} className={`tt-checklist-item ${item.checked ? "is-done" : ""}`}>
								<button
									type="button"
									className={`tt-check ${item.checked ? "is-checked" : ""}`}
									style={{ borderRadius: 9999 }}
									aria-label={item.checked ? "Uncheck item" : "Check item"}
									disabled={readOnly}
									onClick={() =>
										saveChecklist(
											checklist.map((current, i) => ({
												text: current.text,
												checked: i === index ? !current.checked : current.checked,
											})),
										)
									}
								>
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
										<path d="m5 12.5 4.5 4.5L19 7.5" />
									</svg>
								</button>
								<span style={{ flex: 1 }}>{item.text}</span>
								{!readOnly && (
									<button
										type="button"
										className="tt-icon-btn"
										aria-label="Remove item"
										onClick={() =>
											saveChecklist(
												checklist.filter((_, i) => i !== index).map(({ text, checked }) => ({ text, checked })),
											)
										}
									>
										<IconClose size={12} />
									</button>
								)}
							</div>
						))}
						{!readOnly && (
							<div className="tt-checklist-item">
								<span style={{ width: 16, color: "var(--tt-text-3)", textAlign: "center" }}>+</span>
								<input
									type="text"
									placeholder="Add checklist item"
									value={newItem}
									onChange={(event) => setNewItem(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter" && newItem.trim()) {
											saveChecklist([
												...checklist.map(({ text, checked }) => ({ text, checked })),
												{ text: newItem.trim(), checked: false },
											]);
											setNewItem("");
										}
									}}
								/>
							</div>
						)}
					</div>
				) : null}

				<textarea
					className="tt-detail-desc"
					data-field="description"
					value={description}
					readOnly={readOnly}
					placeholder="Description"
					onChange={(event) => setDescription(event.target.value)}
					onBlur={(event) => saveDescription(event.currentTarget.value)}
				/>

				<div className="tt-detail-meta">
					<div className="tt-field-row">
						<span className="tt-field-label">List</span>
						<select
							className="tt-select"
							value={task.milestone ?? ""}
							disabled={readOnly}
							onChange={(event) => {
								const milestone = event.target.value || null;
								void updateTask(task, { milestone }, { milestone: milestone ?? undefined });
							}}
						>
							<option value="">Inbox</option>
							{options.map((option) => (
								<option key={option.id} value={option.id}>
									{option.label}
								</option>
							))}
						</select>
					</div>
					{projects.length > 0 && (
						<div className="tt-field-row">
							<span className="tt-field-label">Area</span>
							<select
								className="tt-select"
								value={task.project ?? ""}
								disabled={readOnly}
								onChange={(event) => {
									const project = event.target.value || null;
									void updateTask(task, { project }, { project: project ?? undefined });
								}}
							>
								<option value="">None</option>
								{projects.map((project) => (
									<option key={project} value={project}>
										{project}
									</option>
								))}
							</select>
						</div>
					)}
					<div className="tt-field-row">
						<span className="tt-field-label">Status</span>
						<select
							className="tt-select"
							value={task.status}
							disabled={readOnly}
							onChange={(event) => void updateTask(task, { status: event.target.value })}
						>
							{statuses.map((status) => (
								<option key={status} value={status}>
									{status}
								</option>
							))}
						</select>
					</div>
					<div className="tt-field-row" style={{ flexWrap: "wrap" }}>
						<span className="tt-field-label">Tags</span>
						<div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, alignItems: "center" }}>
							{task.labels.map((label) => (
								<span key={label} className="tt-chip">
									#{label}
									{!readOnly && (
										<button
											type="button"
											aria-label={`Remove tag ${label}`}
											onClick={() => setTags(task.labels.filter((existing) => existing !== label))}
										>
											×
										</button>
									)}
								</span>
							))}
							{!readOnly && (
								<input
									className="tt-select"
									style={{ minWidth: 80 }}
									placeholder="Add tag"
									value={newTag}
									onChange={(event) => setNewTag(event.target.value)}
									onKeyDown={(event) => {
										const value = newTag.trim().replace(/^#/, "");
										if ((event.key === "Enter" || event.key === ",") && value) {
											event.preventDefault();
											if (!task.labels.some((label) => label.toLowerCase() === value.toLowerCase())) {
												setTags([...task.labels, value]);
											}
											setNewTag("");
										}
									}}
								/>
							)}
						</div>
					</div>
					<div className="tt-field-row">
						<span className="tt-field-label">Points</span>
						<input
							className="tt-select"
							type="number"
							min={0}
							step="any"
							disabled={readOnly}
							defaultValue={task.storyPoints ?? ""}
							key={String(task.storyPoints ?? "")}
							placeholder="—"
							onBlur={(event) => {
								const raw = event.target.value.trim();
								const storyPoints = raw === "" ? null : Number(raw);
								if (storyPoints !== null && (!Number.isFinite(storyPoints) || storyPoints < 0)) return;
								if (storyPoints !== (task.storyPoints ?? null)) {
									void updateTask(task, { storyPoints }, { storyPoints: storyPoints ?? undefined });
								}
							}}
						/>
					</div>
				</div>
			</div>

			<div className="tt-detail-foot">
				<span style={{ color: "var(--tt-text-3)" }}>{task.id}</span>
				<span style={{ flex: 1 }} />
				<button type="button" className="tt-icon-btn" title="Open full editor" onClick={() => openFullEditor(task)}>
					<IconExpand size={16} />
				</button>
				{!readOnly && (
					<button
						type="button"
						className="tt-icon-btn"
						title="Archive task"
						onClick={() => {
							if (window.confirm(`Archive "${task.title}"? It moves to the archive, not deleted.`)) {
								void archiveTask(task).then(onClose);
							}
						}}
					>
						<IconTrash size={16} />
					</button>
				)}
			</div>
		</aside>
	);
}
