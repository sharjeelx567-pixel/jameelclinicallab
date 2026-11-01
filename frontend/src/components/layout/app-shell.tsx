'use client';

import { Bell, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/form-controls';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/misc';
import { AnimatedBackground } from '@/components/shared/animated-background';
import { Avatar } from '@/components/shared/cloud-image';
import { Logo } from '@/components/shared/logo';
import { BRAND, NAV, ROUTE_LABELS } from '@/constants';
import { AUTH_MODE, useAuth } from '@/features/auth/auth-provider';
import { useApi } from '@/hooks/use-api';
import { cn, timeAgo } from '@/lib/utils';
import { authService, notificationsService } from '@/services/admin.service';
import { ThemeToggle } from './theme';

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  return (
    <nav className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Main">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.permission || can(i.permission));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            {!collapsed && <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted/80">{group.label}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-white/[0.06] hover:text-white',
                        active && 'bg-gradient-to-r from-primary/90 to-brand-2/80 text-white shadow-glow',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      <item.icon className={cn('size-[18px] shrink-0', active ? 'text-white' : 'text-sidebar-muted group-hover:text-white')} aria-hidden />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Intermediate breadcrumb segments only link to real pages (avoids dead links such as /billing/invoice). */
const LINKABLE = new Set([...NAV.flatMap((g) => g.items.map((i) => i.href)), '/analyzers/messages', '/patients/new', '/orders/new', '/tests/new']);

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {parts.map((p, i) => {
          const href = `/${parts.slice(0, i + 1).join('/')}`;
          // Any segment that isn't a known page is a record id (e.g. test-cbc, a Firestore id): show "Details".
          const label = ROUTE_LABELS[p] ?? (i > 0 ? 'Details' : p);
          const last = i === parts.length - 1;
          return (
            <li key={href} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              {last ? (
                <span className="truncate font-medium text-foreground" aria-current="page">{label}</span>
              ) : LINKABLE.has(href) ? (
                <Link href={href} className="truncate hover:text-foreground">{label}</Link>
              ) : (
                <span className="truncate">{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const { can } = useAuth();
  const [q, setQ] = React.useState('');
  if (!can('patients.read')) return null;
  return (
    <form
      role="search"
      className="relative hidden w-52 lg:block xl:w-64 2xl:w-80"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) router.push(`/patients?q=${encodeURIComponent(term)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search MR no., name, mobile, CNIC" className="h-9 bg-muted/60 pl-9" aria-label="Search patients" />
    </form>
  );
}

function NotificationsMenu() {
  const { can } = useAuth();
  const enabled = can('notifications.read');
  const state = useApi(enabled ? () => notificationsService.list() : null, [enabled]);
  React.useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => void state.reload(), 60_000);
    return () => clearInterval(t);
  }, [enabled, state.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled) return null;
  const unread = state.data?.unread ?? 0;
  return (
    <DropdownMenu onOpenChange={(o) => o && void state.reload()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem]">
        <div className="flex items-center justify-between px-2.5 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button className="text-xs font-medium text-primary hover:underline" onClick={() => void notificationsService.readAll().then(state.reload)}>
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[60vh] overflow-y-auto">
          {!state.data?.items.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            state.data.items.slice(0, 8).map((n) => (
              <DropdownMenuItem key={n.id} asChild className="items-start">
                <Link href={n.link ?? '/notifications'} onClick={() => void notificationsService.read(n.id)}>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : n.severity === 'critical' ? 'bg-destructive' : n.severity === 'warning' ? 'bg-warning' : 'bg-primary')} />
                  <span className="min-w-0">
                    <span className={cn('block truncate text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="justify-center text-primary">View all notifications</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-muted" aria-label="Account menu">
          <Avatar photo={user.photo} name={user.displayName} size={32} />
          <span className="hidden min-w-0 text-left leading-tight sm:block lg:hidden xl:block">
            <span className="block max-w-[10rem] truncate text-sm font-medium">{user.displayName}</span>
            <span className="block max-w-[10rem] truncate text-[11px] text-muted-foreground">{user.roleLabel}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">{user.displayName}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile"><UserRound /> My profile & security</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Development-mode banner: shown whenever the backend is not using real auth or persistent storage. */
function EnvironmentBanner() {
  const cfg = useApi(() => authService.config(), []);
  const dev = AUTH_MODE === 'dev' || cfg.data?.authMode === 'dev' || cfg.data?.dataBackend === 'memory';
  if (!dev) return null;
  return (
    <div role="status" className="no-print border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">
      DEVELOPMENT MODE — {cfg.data?.dataBackend === 'memory' ? 'in-memory data (not saved), ' : ''}
      {AUTH_MODE === 'dev' ? 'demo sign-in. ' : ''}Do not enter real patient information.
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="relative flex min-h-dvh">
      <AnimatedBackground />
      {/* Desktop sidebar */}
      <aside className={cn('no-print sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-sidebar/95 shadow-elevated backdrop-blur-xl transition-[width] duration-300 ease-smooth lg:flex', collapsed ? 'w-[76px]' : 'w-64')}>
        <div className={cn('flex h-16 items-center border-b border-white/[0.06] px-4', collapsed && 'justify-center px-0')}>
          <Link href="/dashboard" aria-label={`${BRAND.name} home`}>
            <Logo collapsed={collapsed} inverted />
          </Link>
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className="border-t border-white/[0.06] p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-muted transition hover:bg-white/[0.06] hover:text-white"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
          </button>
          {!collapsed && <p className="mt-2 px-1 text-center text-[10.5px] italic text-sidebar-muted/70 [@media(max-height:820px)]:hidden">{BRAND.tagline}</p>}
        </div>
      </aside>

      {/* Mobile drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col border-none bg-sidebar p-0" aria-describedby={undefined}>
          <div className="flex h-16 items-center border-b border-white/[0.06] px-4">
            <Logo inverted />
          </div>
          <span className="sr-only" id="mobile-nav-title">Navigation</span>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <p className="border-t border-white/[0.06] p-3 text-center text-[10.5px] italic text-sidebar-muted/70">{BRAND.tagline}</p>
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <EnvironmentBanner />
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[hsl(var(--glass-border))] bg-background/60 px-4 backdrop-blur-xl sm:px-6 lg:top-3 lg:mx-3 lg:mt-3 lg:rounded-2xl lg:border">
          <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Link href="/dashboard" className="min-w-0 lg:hidden">
            <Logo className="[&_div]:hidden min-[400px]:[&_div]:block" />
          </Link>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <GlobalSearch />
            <ThemeToggle />
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function DemoNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning">
      <Badge tone="demo">DEMO</Badge>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
