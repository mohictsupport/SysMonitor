import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

// Redirect to /sites since Add Site is now a modal
function AddSitePage() {
  return <Navigate to="/sites" />;
}

export const Route = createLazyFileRoute("/sites/new")({
  component: AddSitePage,
});
