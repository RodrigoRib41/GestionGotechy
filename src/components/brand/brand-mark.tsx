import Image from "next/image";

import { cn } from "@/lib/utils";

const brandLogo = "/logo.jpg";

export function BrandMark({
  compact = false,
  priority = false,
  className
}: {
  compact?: boolean;
  priority?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div className={cn("relative h-9 w-9 overflow-hidden rounded-lg bg-background shadow-sm ring-1 ring-border", className)}>
        <Image alt="Gotechy" className="object-cover" fill priority={priority} sizes="36px" src={brandLogo} />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-background shadow-sm ring-1 ring-border">
        <Image alt="Gotechy" className="object-cover" fill priority={priority} sizes="40px" src={brandLogo} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">Gotechy</div>
        <div className="truncate text-xs text-muted-foreground">Internal Suite</div>
      </div>
    </div>
  );
}
