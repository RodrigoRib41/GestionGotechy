import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();
const pollIntervalMs = 2000;

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "No autenticado" }, { status: 401 });
  }

  let lastCreatedAt = new Date(Date.now() - 10_000);
  const lastEventId = request.headers.get("last-event-id");

  if (lastEventId) {
    const lastEvent = await prisma.realtimeEvent.findUnique({
      where: { id: lastEventId },
      select: { createdAt: true }
    });
    if (lastEvent) lastCreatedAt = lastEvent.createdAt;
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      request.signal.addEventListener("abort", () => {
        closed = true;
        controller.close();
      });

      controller.enqueue(encoder.encode(": connected\n\n"));

      while (!closed) {
        const events = await prisma.realtimeEvent.findMany({
          where: {
            createdAt: { gt: lastCreatedAt },
            OR: [{ userId: null }, { userId: session.user.id }]
          },
          orderBy: { createdAt: "asc" },
          take: 50
        });

        for (const event of events) {
          lastCreatedAt = event.createdAt;
          controller.enqueue(
            encoder.encode(
              `id: ${event.id}\nevent: message\ndata: ${JSON.stringify({
                id: event.id,
                type: event.type,
                payload: event.payload,
                createdAt: event.createdAt.toISOString()
              })}\n\n`
            )
          );
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
