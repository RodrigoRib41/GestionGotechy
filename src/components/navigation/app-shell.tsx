"use client";

import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  Clock3,
  ClipboardList,
  Download,
  Gauge,
  Goal,
  Menu,
  Moon,
  Shield,
  Sun,
  UsersRound,
  X
} from "lucide-react";
import { useTheme } from "next-themes";
import { ReactNode, useCallback, useMemo, useState, useTransition } from "react";

import { signOutAction } from "@/lib/actions/auth-actions";
import { loadNotificationSnapshot, markAllNotificationsRead, markNotificationRead } from "@/lib/actions/notification-actions";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlobalSearch } from "@/components/navigation/global-search";
import { ThemeVariantSelector } from "@/components/navigation/theme-variant-selector";
import { BrandMark } from "@/components/brand/brand-mark";
import { RealtimeProvider, useRealtimeEvent } from "@/components/realtime/realtime-provider";

const navItems: Array<{ href: string; label: string; icon: typeof Gauge; allowedRoles: Role[] }> = [
  { href: "/", label: "Dashboard", icon: Gauge, allowedRoles: ["COLABORADOR", "ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/time", label: "Carga de horas", icon: Clock3, allowedRoles: ["COLABORADOR", "ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/tracking", label: "Seguimiento", icon: ClipboardList, allowedRoles: ["COLABORADOR", "ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/objectives", label: "Objetivos", icon: Goal, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/projects", label: "Proyectos", icon: BriefcaseBusiness, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/clients", label: "Clientes", icon: Building2, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/reports", label: "Reportes", icon: Download, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/team", label: "Colaboradores", icon: UsersRound, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/admin", label: "Administración", icon: Shield, allowedRoles: ["SUPERADMIN"] }
];

const titles: Record<string, string> = {
  "/": "Dashboard principal",
  "/time": "Registro de horas",
  "/tracking": "Seguimiento",
  "/objectives": "Objetivos",
  "/projects": "Proyectos",
  "/clients": "Clientes",
  "/reports": "Reportes",
  "/team": "Colaboradores",
  "/admin": "Administración"
};

type NotificationSnapshot = {
  unreadCount: number;
  items: Array<{
    id: string;
    title: string;
    body: string | null;
    readAt: string | null;
    createdAt: string;
    href: string;
  }>;
};

export function AppShell({
  children,
  hasTrackingAccess = false,
  notifications,
  user
}: {
  children: ReactNode;
  hasTrackingAccess?: boolean;
  notifications: NotificationSnapshot;
  user: Session["user"];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationState, setNotificationState] = useState(notifications);
  const [, startNotificationTransition] = useTransition();
  const { theme, setTheme } = useTheme();
  const visibleItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.href === "/tracking") return hasTrackingAccess;
        return user.role === "SUPERADMIN" || item.allowedRoles.includes(user.role);
      }),
    [hasTrackingAccess, user.role]
  );
  const title = titles[pathname] ?? "Gotechy Consulting";
  const refreshNotifications = useCallback(() => {
    startNotificationTransition(async () => {
      const snapshot = await loadNotificationSnapshot();
      setNotificationState(snapshot);
    });
  }, []);

  useRealtimeEvent(
    useCallback(
      (message) => {
        if (message.type === "NOTIFICATION" || message.type === "TIME_ENTRY_COMMENT") refreshNotifications();
      },
      [refreshNotifications]
    )
  );

  return (
    <RealtimeProvider>
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 border-r bg-card/92 backdrop-blur-xl transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-3">
              <BrandMark className="hidden sm:flex" priority />
              <BrandMark className="sm:hidden" compact priority />
              <div className="sr-only">
                <div className="text-sm font-semibold">Gotechy</div>
                <div className="text-xs text-muted-foreground">Internal Suite</div>
              </div>
            </Link>
            <Button className="lg:hidden" onClick={() => setOpen(false)} size="icon" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-3">
            {visibleItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                {initials(user.name, user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{user.name ?? "Usuario"}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={user.role === "SUPERADMIN" ? "success" : "muted"}>{roleLabel(user.role)}</Badge>
              <form action={signOutAction} className="ml-auto">
                <Button size="sm" type="submit" variant="ghost">
                  Salir
                </Button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {open ? <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} /> : null}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/82 px-4 backdrop-blur-xl sm:px-6">
          <Button className="lg:hidden" onClick={() => setOpen(true)} size="icon" variant="ghost">
            <Menu className="h-5 w-5" />
          </Button>
          <BrandMark compact className="h-8 w-8 lg:hidden" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-normal sm:text-lg">{title}</h1>
          </div>
          <GlobalSearch />
          <div className="relative">
            <Button
              aria-label="Notificaciones"
              className="relative"
              onClick={() => setNotificationsOpen((value) => !value)}
              size="icon"
              variant="ghost"
            >
              <Bell className="h-4 w-4" />
              {notificationState.unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {notificationState.unreadCount > 9 ? "9+" : notificationState.unreadCount}
                </span>
              ) : null}
            </Button>
            {notificationsOpen ? (
              <div className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-card shadow-xl">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">Notificaciones</div>
                    <div className="text-xs text-muted-foreground">{notificationState.unreadCount} sin leer</div>
                  </div>
                  <Button
                    className="h-8"
                    disabled={!notificationState.unreadCount}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNotificationState((current) => ({
                        unreadCount: 0,
                        items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))
                      }));
                      void markAllNotificationsRead();
                    }}
                  >
                    Marcar leídas
                  </Button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notificationState.items.length ? (
                    notificationState.items.map((item) => (
                      <button
                        key={item.id}
                        className="block w-full border-b px-3 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted/50"
                        type="button"
                        onClick={() => {
                          setNotificationState((current) => ({
                            unreadCount: Math.max(0, current.unreadCount - (item.readAt ? 0 : 1)),
                            items: current.items.map((row) => (row.id === item.id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row))
                          }));
                          void markNotificationRead(item.id);
                          window.location.href = item.href;
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {!item.readAt ? <span className="mt-1.5 h-2 w-2 rounded-full bg-primary" /> : <span className="mt-1.5 h-2 w-2" />}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.title}</div>
                            {item.body ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</div> : null}
                            <div className="mt-1 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("es-AR")}</div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">No hay notificaciones pendientes.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <ThemeVariantSelector initialVariant={user.themeVariant} />
          <Button
            aria-label="Cambiar tema"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            size="icon"
            variant="ghost"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </header>
        <main data-global-search-scope className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
    </RealtimeProvider>
  );
}

function roleLabel(role: Role) {
  if (role === "SUPERADMIN") return "Superadmin";
  if (role === "ADMINISTRADOR") return "Administrador";
  return "Colaborador";
}
