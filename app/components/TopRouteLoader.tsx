// app/components/TopRouteLoader.tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const EVENT_START = "ml:route-loading-start";

function TopRouteLoaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [active, setActive] = useState(false);
  const lastRouteRef = useRef<string>("");

  // START immédiat au clic
  useEffect(() => {
    const onStart = () => setActive(true);
    window.addEventListener(EVENT_START, onStart);
    return () => window.removeEventListener(EVENT_START, onStart);
  }, []);

  // STOP uniquement quand la route est réellement chargée
  useEffect(() => {
    const current = `${pathname}?${searchParams?.toString() ?? ""}`;

    if (!lastRouteRef.current) {
      lastRouteRef.current = current;
      return;
    }

    if (current !== lastRouteRef.current) {
      lastRouteRef.current = current;
      setActive(false);
    }
  }, [pathname, searchParams]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] overflow-hidden"
      aria-hidden="true"
    >
      {/* Track */}
      <div className="absolute inset-0 bg-black/5 dark:bg-white/10" />

      <div className="absolute top-0 h-full w-[42%] rounded-full ml-toploader-rainbow ml-toploader shadow-[0_0_14px_rgba(0,0,0,0.18)]" />
    </div>
  );
}

export default function TopRouteLoader() {
  // ✅ Next 16: useSearchParams doit être sous Suspense
  return (
    <Suspense fallback={null}>
      <TopRouteLoaderInner />
    </Suspense>
  );
}