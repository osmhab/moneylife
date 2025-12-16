//app/components/route-loading.ts
"use client";

const EVENT_START = "ml:route-loading-start";

export function startRouteLoading() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT_START));
}