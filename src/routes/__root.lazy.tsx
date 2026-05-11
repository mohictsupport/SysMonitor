import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { setupNavigationHandler, isElectron } from "@/lib/electron-notifications";
import { Toaster } from "@/components/ui/sonner";
import { useInactivityLogout } from "@/lib/use-inactivity-logout";
import { UpdateNotification } from "@/components/UpdateNotification";
import { AppFooter } from "@/components/AppFooter";

import "../styles.css";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Setup inactivity logout (disabled temporarily)
  // useInactivityLogout();

  // Setup Electron navigation handler
  useEffect(() => {
    if (isElectron()) {
      const cleanup = setupNavigationHandler((path) => {
        router.navigate({ to: path });
      });
      return cleanup;
    }
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <AppFooter />
      </div>
      <Toaster />
      <UpdateNotification />
    </QueryClientProvider>
  );
}
