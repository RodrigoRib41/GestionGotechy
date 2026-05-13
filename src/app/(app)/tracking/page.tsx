import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getTrackingData } from "@/lib/data/tracking";
import { canViewTracking } from "@/lib/permissions";
import { TrackingClient } from "@/components/tracking/tracking-client";

export default async function TrackingPage() {
  const session = await auth();

  if (!canViewTracking(session)) {
    redirect("/");
  }

  const data = await getTrackingData();

  return <TrackingClient data={data} />;
}
