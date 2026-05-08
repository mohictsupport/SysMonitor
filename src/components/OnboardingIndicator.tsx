import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { showOnboardingNotification, isElectron } from "@/lib/electron-notifications";

interface OnboardingIndicatorProps {
  pendingCount: number;
}

export function OnboardingIndicator({ pendingCount }: OnboardingIndicatorProps) {
  const prevCountRef = useRef(0);
  const lastNotificationTimeRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only show notification when pending count increases
    const countIncreased = pendingCount > prevCountRef.current;
    const now = Date.now();
    const timeSinceLastNotification = now - lastNotificationTimeRef.current;
    const MIN_INTERVAL_MS = 60000; // Minimum 1 minute between onboarding notifications

    if (countIncreased && pendingCount > 0 && timeSinceLastNotification > MIN_INTERVAL_MS) {
      // Debounce: wait for rapid changes to settle
      debounceTimerRef.current = setTimeout(() => {
        if (isElectron()) {
          showOnboardingNotification(pendingCount);
          lastNotificationTimeRef.current = Date.now();
        }
      }, 5000); // Wait 5 seconds for rapid changes to settle
    }

    prevCountRef.current = pendingCount;

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [pendingCount]);

  if (pendingCount === 0) return null;

  return (
    <Link
      to="/sites"
      className="flex items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-3 py-1 transition-colors hover:opacity-80"
      title={`${pendingCount} new site${pendingCount !== 1 ? "s" : ""} waiting for approval`}
    >
      <span className="flex size-4 items-center justify-center rounded-full bg-amber font-mono text-[9px] font-bold text-background">
        {pendingCount}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-amber">
        New Site{pendingCount !== 1 ? "s" : ""}
      </span>
    </Link>
  );
}
