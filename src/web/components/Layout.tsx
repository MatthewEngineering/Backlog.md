import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SideNavigation from './SideNavigation';
import Navigation from './Navigation';
import { HealthIndicator, HealthSuccessToast } from './HealthIndicator';
import { DuplicateIdWarning } from './DuplicateIdWarning';
import type { DuplicateRepairPlan } from '../../core/duplicate-task-repair';
import { type Task, type Document, type Decision } from '../../types';

interface LayoutProps {
	projectName: string;
	showSuccessToast: boolean;
	onDismissToast: () => void;
	tasks: Task[];
	docs: Document[];
	decisions: Decision[];
	isLoading: boolean;
	loadingMessage?: string | null;
	error?: Error | null;
	onRefreshData: () => Promise<void>;
	duplicateRepairPlan?: DuplicateRepairPlan | null;
}

export default function Layout({
	projectName,
	showSuccessToast,
	onDismissToast,
	tasks,
	docs,
	decisions,
	isLoading,
	loadingMessage,
	error,
	onRefreshData,
	duplicateRepairPlan = null,
}: LayoutProps) {
	// Below the md breakpoint the side navigation is a drawer over the page instead of a column.
	const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
	const { pathname } = useLocation();
	useEffect(() => setIsMobileNavOpen(false), [pathname]);

	return (
		<div className="h-dvh bg-gray-50 dark:bg-gray-900 flex overflow-hidden transition-colors duration-200">
			<HealthIndicator />
			<div
				className={`fixed inset-y-0 left-0 z-50 flex transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
					isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
				}`}
			>
				<SideNavigation
					taskCount={tasks.length}
					docs={docs}
					decisions={decisions}
					isLoading={isLoading}
					error={error}
					onRetry={onRefreshData}
					onRefreshData={onRefreshData}
				/>
			</div>
			{isMobileNavOpen && (
				<div
					aria-hidden="true"
					className="fixed inset-0 z-40 bg-black/40 md:hidden"
					onClick={() => setIsMobileNavOpen(false)}
				/>
			)}
			<div className="flex-1 flex flex-col min-h-0 min-w-0">
				<Navigation
					projectName={projectName}
					loadingMessage={loadingMessage}
					onOpenMobileNav={() => setIsMobileNavOpen(true)}
				/>
				<DuplicateIdWarning plan={duplicateRepairPlan} onRepaired={onRefreshData} />
				<main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
					<Outlet context={{ tasks, docs, decisions, isLoading, onRefreshData }} />
				</main>
			</div>
			{showSuccessToast && (
				<HealthSuccessToast onDismiss={onDismissToast} />
			)}
		</div>
	);
}
