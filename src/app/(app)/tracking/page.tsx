import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getTrackingData, hasAssignedTrackingTasks } from "@/lib/data/tracking";
import { canViewTracking } from "@/lib/permissions";
import { TrackingClient } from "@/components/tracking/tracking-client";

export default async function TrackingPage() {
  const session = await auth();

  const hasTrackingAccess = canViewTracking(session) || Boolean(session?.user.id && (await hasAssignedTrackingTasks(session.user.id)));

  if (!hasTrackingAccess) {
    redirect("/");
  }

  const data = await getTrackingData();

  return <TrackingClient data={data} />;
}
