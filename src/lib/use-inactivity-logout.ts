import { useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useNavigate, useLocation } from "@tanstack/react-router";

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVITY_THROTTLE_MS = 1000; // 1 second throttle for activity events

export function useInactivityLogout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(0);
  const navigate = useNavigate();
  const location = useLocation();

  const resetTimeout = () => {
    // Don't run inactivity logic on login page
    if (location.pathname === "/login") {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      const user = auth.currentUser;
      // Only logout if a user is actually logged in
      if (user && location.pathname !== "/login") {
        console.log("[Inactivity] User inactive for 10m, signing out...");
        try {
          await signOut(auth);
          navigate({ to: "/login" });
        } catch (error) {
          console.error("Auto-logout failed:", error);
        }
      }
    }, INACTIVITY_TIMEOUT_MS);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Skip activity tracking on login page
    if (location.pathname === "/login") {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click"];

    const handleActivity = () => {
      const now = Date.now();
      // Throttle activity resets to avoid event loop pressure (especially mousemove)
      if (now - lastActivityRef.current > ACTIVITY_THROTTLE_MS) {
        lastActivityRef.current = now;
        resetTimeout();
      }
    };

    // Set initial timeout
    resetTimeout();

    // Add event listeners
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [navigate, location.pathname]); // Re-run when switching to/from login page
}
