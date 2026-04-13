'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from '@/actions/auth';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconPrescriptions({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function IconCatalogue({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconJournal({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

// ── NavItem ───────────────────────────────────────────────────────────────────

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  onNavigate?: () => void;
}

function NavItem({ href, label, icon, exact = false, onNavigate }: NavItemProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-100 ${
        isActive
          ? 'bg-teal-500/20 text-teal-300'
          : 'text-navy-200 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span
        className={`w-5 h-5 flex-shrink-0 ${
          isActive ? 'text-teal-400' : 'text-navy-300 group-hover:text-white'
        }`}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

// ── UserAvatar ────────────────────────────────────────────────────────────────

function initials(name: string, email: string): string {
  if (name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  orgId:         string;
  orgName:       string;
  userFullName:  string;
  userEmail:     string;
  role:          string;
  onNavigate?:   () => void;
}

export function Sidebar({
  orgName,
  userFullName,
  userEmail,
  role,
  onNavigate,
}: SidebarProps) {
  const t = useTranslations('nav');

  const displayName = userFullName || userEmail;
  const avatarInitials = initials(userFullName, userEmail);

  const isAdmin = role === 'admin';

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col bg-navy-900">
      {/* Header — logo + org name */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <Image
          src="/logo.png"
          alt="RxMatch"
          width={80}
          height={80}
          className="flex-shrink-0 rounded-lg object-contain"
          style={{ width: 40, height: 40 }}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight truncate">
            <span className="text-white">Rx</span><span className="text-teal-400">Match</span>
          </p>
          <p className="text-xs text-navy-300 truncate" title={orgName}>{orgName}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <NavItem
          href="/dashboard"
          exact
          label={t('dashboard')}
          icon={<IconDashboard className="w-5 h-5" />}
          onNavigate={onNavigate}
        />
        <NavItem
          href="/ordonnances"
          label={t('prescriptions')}
          icon={<IconPrescriptions className="w-5 h-5" />}
          onNavigate={onNavigate}
        />
        <NavItem
          href="/catalogue"
          label={t('catalogue')}
          icon={<IconCatalogue className="w-5 h-5" />}
          onNavigate={onNavigate}
        />

        {/* Settings — all roles */}
        <NavItem
          href="/parametres"
          label={t('settings')}
          icon={<IconSettings className="w-5 h-5" />}
          onNavigate={onNavigate}
        />

        {/* Journal — admin only */}
        {isAdmin && (
          <>
            <div className="my-2 border-t border-white/10" />
            <NavItem
              href="/journal"
              label={t('journal')}
              icon={<IconJournal className="w-5 h-5" />}
              onNavigate={onNavigate}
            />
          </>
        )}
      </nav>

      {/* Footer — user info + logout */}
      <div className="border-t border-white/10 px-3 py-4">
        <div className="flex items-center gap-3 px-2 mb-2">
          {/* Avatar */}
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold text-teal-300 select-none">
            {avatarInitials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{displayName}</p>
            {userFullName && (
              <p className="truncate text-xs text-navy-300">{userEmail}</p>
            )}
          </div>
        </div>

        {/* Logout */}
        <form action={signOut}>
          <button
            type="submit"
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-navy-300 hover:bg-white/5 hover:text-white transition-colors duration-100"
          >
            <IconLogout className="w-5 h-5 text-navy-400 group-hover:text-white" />
            {t('logout')}
          </button>
        </form>
      </div>
    </aside>
  );
}
