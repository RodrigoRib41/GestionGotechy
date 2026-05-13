"use client";

import { Check, Palette } from "lucide-react";
import type { ThemeVariant } from "@prisma/client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateThemeVariant } from "@/lib/actions/resource-actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const variants: Array<{ id: ThemeVariant; label: string; swatches: string[] }> = [
  { id: "DEFAULT", label: "Principal", swatches: ["#0F172A", "#14B8A6", "#F8FAFC"] },
  { id: "MIDNIGHT", label: "Midnight", swatches: ["#111827", "#38BDF8", "#020617"] },
  { id: "EMERALD", label: "Emerald", swatches: ["#064E3B", "#10B981", "#ECFDF5"] },
  { id: "CORPORATE", label: "Corporate", swatches: ["#1E3A8A", "#64748B", "#F8FAFC"] }
];

const storageKey = "gotechy:theme-variant";

export function ThemeVariantSelector({ initialVariant }: { initialVariant: ThemeVariant }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<ThemeVariant>(initialVariant);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey) as ThemeVariant | null;
    const next = variants.some((item) => item.id === stored) ? stored ?? initialVariant : initialVariant;
    applyTheme(next);
    setVariant(next);
  }, [initialVariant]);

  function selectTheme(next: ThemeVariant) {
    setVariant(next);
    applyTheme(next);
    window.localStorage.setItem(storageKey, next);
    startTransition(async () => {
      const result = await updateThemeVariant({ themeVariant: next });
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <div className="relative">
      <Button aria-label="Temas visuales" disabled={isPending} size="icon" variant="ghost" onClick={() => setOpen((current) => !current)}>
        <Palette className="h-4 w-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-lg border bg-card p-2 shadow-lg">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Tema visual</div>
          <div className="space-y-1">
            {variants.map((item) => (
              <button
                key={item.id}
                className={cn("flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted", variant === item.id && "bg-muted")}
                type="button"
                onClick={() => {
                  selectTheme(item.id);
                  setOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="flex overflow-hidden rounded-full border">
                    {item.swatches.map((swatch) => (
                      <span key={swatch} className="h-4 w-4" style={{ backgroundColor: swatch }} />
                    ))}
                  </span>
                  {item.label}
                </span>
                {variant === item.id ? <Check className="h-4 w-4 text-teal-600" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function applyTheme(variant: ThemeVariant) {
  document.documentElement.dataset.theme = variant.toLowerCase();
}
