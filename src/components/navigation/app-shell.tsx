"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Clock3,
  Download,
  Gauge,
  Menu,
  Moon,
  Search,
  Settings2,
  Shield,
  Sun,
  UsersRound,
  X
} from "lucide-react";
import { useTheme } from "next-themes";
import { ReactNode, useMemo, useState } from "react";
import type { Session } from "next-auth";

import { signOutAction } from "@/lib/actions/auth-actions";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const navItems: Array<{ href: string; label: string; icon: typeof Gauge; roles: Role[] }> = [
  { href: "/", label: "Dashboard", icon: Gauge, roles: ["COLLABORATOR", "REPORTER", "ADMINISTRATOR", "SUPERADMIN"] },
  { href: "/time", label: "Carga de horas", icon: Clock3, roles: ["COLLABORATOR", "SUPERADMIN"] },
  { href: "/projects", label: "Proyectos", icon: BriefcaseBusiness, roles: ["ADMINISTRATOR", "SUPERADMIN"] },
  { href: "/clients", label: "Clientes", icon: Building2, roles: ["ADMINISTRATOR", "SUPERADMIN"] },
  { href: "/reports", label: "Reportes", icon: Download, roles: ["REPORTER", "SUPERADMIN"] },
  { href: "/analytics", label: "Analítica", icon: BarChart3, roles: ["REPORTER", "SUPERADMIN"] },
  { href: "/team", label: "Colaboradores", icon: UsersRound, roles: ["SUPERADMIN"] },
  { href: "/admin", label: "Administración", icon: Shield, roles: ["SUPERADMIN"] }
];

const titles: Record<string, string> = {
  "/": "Dashboard principal",
  "/time": "Registro de horas",
  "/projects": "Proyectos",
  "/clients": "Clientes",
  "/reports": "Reportes",
  "/analytics": "Dashboards analíticos",
  "/team": "Colaboradores",
  "/admin": "Administración"
};

export function AppShell({ children, user }: { children: ReactNode; user: Session["user"] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const visibleItems = useMemo(
    () => navItems.filter((item) => user.roles?.includes("SUPERADMIN") || item.roles.some((role) => user.roles?.includes(role))),
    [user.roles]
  );
  const title = titles[pathname] ?? "Gotechy Consulting";

  return (
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
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                GC
              </div>
              <div>
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
              <Badge variant={user.roles?.includes("SUPERADMIN") ? "success" : "muted"}>
                {user.roles?.join(" + ") ?? user.role}
              </Badge>
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
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-normal sm:text-lg">{title}</h1>
          </div>
          <div className="hidden h-9 min-w-64 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground md:flex">
            <Search className="h-4 w-4" />
            <span>Buscar en horas, proyectos, clientes</span>
          </div>
          <Button
            aria-label="Cambiar tema"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            size="icon"
            variant="ghost"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <Button aria-label="Configuración" size="icon" variant="ghost">
            <Settings2 className="h-4 w-4" />
          </Button>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
