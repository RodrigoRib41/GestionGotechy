import { ArrowRight, ShieldCheck } from "lucide-react";

import { signInWithGoogle } from "@/lib/actions/auth-actions";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,rgba(20,184,166,0.18),transparent_28%),linear-gradient(135deg,#f8fafc_0%,#eef2f7_46%,#f7faf9_100%)] px-4 py-8 dark:bg-[radial-gradient(circle_at_15%_20%,rgba(20,184,166,0.16),transparent_28%),linear-gradient(135deg,#0f172a_0%,#111827_46%,#0b1220_100%)]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <section className="grid w-full gap-10 lg:grid-cols-[1fr_430px] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-8">
              <BrandMark priority />
            </div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-white/70 px-3 py-1 text-sm font-medium text-teal-700 shadow-sm backdrop-blur dark:bg-white/5 dark:text-teal-200">
              <ShieldCheck className="h-4 w-4" />
              Acceso privado
            </div>
            <h1 className="text-balance text-4xl font-semibold tracking-normal text-slate-950 dark:text-white sm:text-5xl">
              Gestion interna de horas con la velocidad de un producto SaaS moderno.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
              Registro rapido, dashboards ejecutivos y control operativo en un unico lugar seguro para el equipo.
            </p>
            <div className="mt-9 grid max-w-lg grid-cols-3 gap-3 text-sm">
              {["Horas", "Proyectos", "KPIs"].map((item) => (
                <div key={item} className="rounded-lg border border-white/70 bg-white/70 p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <div className="font-semibold text-slate-950 dark:text-white">{item}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-teal-500/70" />
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-xl p-6">
            <div className="mb-8">
              <div className="mb-4">
                <BrandMark compact priority />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Gotechy Consulting</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal">Ingresar con Google</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Solo pueden acceder cuentas previamente habilitadas por un superadmin.
              </p>
            </div>
            <form action={signInWithGoogle}>
              <Button className="h-11 w-full justify-between" type="submit">
                Continuar con Google
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
            <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              La autorizacion se valida en servidor antes de crear la sesion.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
