"use client";

import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
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
import { ReactNode, useMemo, useState } from "react";

import { signOutAction } from "@/lib/actions/auth-actions";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlobalSearch } from "@/components/navigation/global-search";
import { ThemeVariantSelector } from "@/components/navigation/theme-variant-selector";
import { BrandMark } from "@/components/brand/brand-mark";

const navItems: Array<{ href: string; label: string; icon: typeof Gauge; allowedRoles: Role[] }> = [
  { href: "/", label: "Dashboard", icon: Gauge, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/time", label: "Carga de horas", icon: Clock3, allowedRoles: ["COLABORADOR", "ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/tracking", label: "Seguimiento", icon: ClipboardList, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/objectives", label: "Objetivos", icon: Goal, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/projects", label: "Proyectos", icon: BriefcaseBusiness, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/clients", label: "Clientes", icon: Building2, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/reports", label: "Reportes", icon: Download, allowedRoles: ["ADMINISTRADOR", "SUPERADMIN"] },
  { href: "/team", label: "Colaboradores", icon: UsersRound, allowedRoles: ["SUPERADMIN"] },
  { href: "/admin", label: "Administracion", icon: Shield, allowedRoles: ["SUPERADMIN"] }
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
  "/admin": "Administracion"
};

export function AppShell({ children, user }: { children: ReactNode; user: Session["user"] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const visibleItems = useMemo(
    () => navItems.filter((item) => user.role === "SUPERADMIN" || item.allowedRoles.includes(user.role)),
    [user.role]
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
  );
}

function roleLabel(role: Role) {
  if (role === "SUPERADMIN") return "Superadmin";
  if (role === "ADMINISTRADOR") return "Administrador";
  return "Colaborador";
}
