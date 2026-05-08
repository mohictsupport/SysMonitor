import { createFileRoute, Navigate } from "@tanstack/react-router";

// Redirect to /sites since Add Site is now a modal
function AddSitePage() {
  return <Navigate to="/sites" />;
}

export const Route = createFileRoute("/sites/new")({
  component: AddSitePage,
});
