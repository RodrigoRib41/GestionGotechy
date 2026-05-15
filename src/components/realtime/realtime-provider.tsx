"use client";

import { ReactNode, useEffect } from "react";

export type RealtimeMessage = {
  id: string;
  type: "NOTIFICATION" | "TRACKING" | "TIME_ENTRY_COMMENT";
  payload: unknown;
  createdAt: string;
};

const realtimeEventName = "gotechy:realtime";

export function RealtimeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const source = new EventSource("/api/realtime");

    source.onmessage = (event) => {
      try {
        const detail = JSON.parse(event.data) as RealtimeMessage;
        window.dispatchEvent(new CustomEvent(realtimeEventName, { detail }));
      } catch {
        return;
      }
    };

    return () => source.close();
  }, []);

  return children;
}

export function useRealtimeEvent(handler: (message: RealtimeMessage) => void) {
  useEffect(() => {
    function onRealtime(event: Event) {
      handler((event as CustomEvent<RealtimeMessage>).detail);
    }

    window.addEventListener(realtimeEventName, onRealtime);
    return () => window.removeEventListener(realtimeEventName, onRealtime);
  }, [handler]);
}
