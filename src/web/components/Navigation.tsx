import React from 'react';
import { BranchIndexingIndicator } from './BranchIndexingIndicator';
import ThemeToggle from './ThemeToggle';

interface NavigationProps {
    projectName: string;
    loadingMessage?: string | null;
    onOpenMobileNav: () => void;
}

const Navigation: React.FC<NavigationProps> = ({projectName, loadingMessage, onOpenMobileNav}) => {
    return (
        <nav className="relative px-4 md:px-8 h-18 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 transition-colors duration-200">
            <div className="h-full flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={onOpenMobileNav}
                        aria-label="Open navigation"
                        className="-ml-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
                    >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <h1 className="truncate text-xl font-bold text-gray-900 dark:text-gray-100">{projectName || 'Loading...'}</h1>
                    <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">powered by</span>
                    <a
                        href="https://backlog.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden sm:inline text-sm text-stone-600 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300 hover:underline transition-colors duration-200"
                    >
                        Backlog.md
                    </a>
                </div>
                <div className="flex items-center gap-3">
                    <BranchIndexingIndicator message={loadingMessage} />
                    <ThemeToggle />
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
