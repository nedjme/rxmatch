'use client';

import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';

interface ShellLayoutProps {
  orgId: string;
  orgName: string;
  userFullName: string;
  userEmail: string;
  role: string;
  children: React.ReactNode;
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function ShellLayout({ orgId, orgName, userFullName, userEmail, role, children }: ShellLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── Mobile top bar ─────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-navy-900 px-4">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-300 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Open menu"
        >
          <IconMenu className="w-5 h-5" />
        </button>
        <p className="text-sm font-bold tracking-tight">
          <span className="text-white">Rx</span>
          <span className="text-teal-400">Match</span>
        </p>
        <p className="text-xs text-navy-300 truncate">{orgName}</p>
      </header>

      {/* ── Backdrop ───────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar (drawer on mobile, static on desktop) ─────── */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 flex
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0
        `}
      >
        {/* Close button visible only on mobile inside drawer */}
        {sidebarOpen && (
          <button
            type="button"
            onClick={close}
            className="lg:hidden absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-navy-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <IconX className="w-4 h-4" />
          </button>
        )}
        <Sidebar
          orgId={orgId}
          orgName={orgName}
          userFullName={userFullName}
          userEmail={userEmail}
          role={role}
          onNavigate={close}
        />
      </div>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto focus:outline-none pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
