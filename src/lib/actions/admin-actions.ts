"use server";

import { getDatabaseState } from "@/lib/data/resources";
import { requireSuperadmin } from "@/lib/permissions";

export async function loadDatabaseState() {
  await requireSuperadmin();
  return { ok: true, state: await getDatabaseState() };
}
