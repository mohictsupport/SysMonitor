import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { getRouter } from "./router";
import { RouterProvider } from "@tanstack/react-router";

// Keep React Query active even when window is minimized/hidden
onlineManager.setEventListener((setOnline) => {
  // Always report as online in Electron to prevent pausing
  if (window.electronAPI?.isElectron) {
    setOnline(true);
    return () => {};
  }
  // Browser fallback
  const handleOnline = () => setOnline(true);
  const handleOffline = () => setOnline(false);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      gcTime: 300_000,
      // Keep fetching even when window is in background
      networkMode: "always",
    },
    mutations: {
      retry: 1,
    },
  },
});

const router = getRouter({ queryClient });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;
createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
