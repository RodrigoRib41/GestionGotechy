import Link from "next/link";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AccessDeniedPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  return (
    <AccessDeniedContent searchParams={searchParams} />
  );
}

async function AccessDeniedContent({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="glass-panel w-full max-w-md rounded-xl p-6 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-normal">Acceso no habilitado</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {params.email ? `${params.email} no está en la lista de usuarios autorizados.` : "Tu cuenta no tiene permisos activos para ingresar."}
        </p>
        <Button asChild className="mt-6 w-full" variant="secondary">
          <Link href="/login">Volver al ingreso</Link>
        </Button>
      </section>
    </main>
  );
}
