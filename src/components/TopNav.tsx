import { Link, useLocation } from "@tanstack/react-router";
import { AlertIndicator } from "./AlertIndicator";
import { OnboardingIndicator } from "./OnboardingIndicator";
import { AddSiteButton } from "./AddSiteButton";
import { UpdateBadge } from "./UpdateNotification";
import { useNetbirdSites } from "@/lib/use-netbird";
import { useEffect, useState } from "react";
import { loadPendingSites, getPendingCount } from "@/lib/site-onboarding";
import { Menu, X } from "lucide-react";

interface TopNavProps {
  onAddSite?: () => void;
}

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/sites", label: "Sites" },
  { to: "/devices", label: "Devices" },
  { to: "/tunnels", label: "Tunnels" },
  { to: "/events", label: "Events" },
  { to: "/reports", label: "Reports" },
  { to: "/alerting", label: "Alerting" },
  { to: "/settings", label: "Settings" },
] as const;

export function TopNav({ onAddSite }: TopNavProps = {}) {
  const { pathname } = useLocation();
  const { sites, error, isLoading, isFetching } = useNetbirdSites();
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSiteAdded = () => {
    // Refresh sites data when a new site is added
    // The useNetbirdSites hook will automatically refresh
    console.log("New site provisioning initiated");
    onAddSite?.();
  };

  // Poll for pending sites count
  useEffect(() => {
    const checkPending = () => {
      const pending = loadPendingSites();
      setPendingCount(getPendingCount(pending));
    };

    checkPending();
    // const interval = setInterval(checkPending, 5000); // Check every 5s

    return () => {
      // clearInterval(interval);
    };
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 md:px-6 backdrop-blur-md">
        <div className="flex items-center gap-4 md:gap-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="relative inline-flex size-6 items-center justify-center rounded-xs bg-phosphor">
              <span className="size-2 rounded-full bg-void" />
              <span className="absolute inset-0 rounded-xs ring-1 ring-phosphor/30" />
            </span>
            <span className="font-mono text-sm font-bold uppercase tracking-tighter text-foreground">
              SysMonitor
            </span>
          </Link>
          <div className="hidden h-4 w-px bg-border md:block" />
          <ul className="hidden items-center gap-6 text-sm font-medium md:flex">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? pathname === "/"
                  : pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={
                      active
                        ? "text-phosphor font-semibold"
                        : "text-dim transition-colors hover:text-foreground"
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <UpdateBadge />
          <OnboardingIndicator pendingCount={pendingCount} />
          <AlertIndicator sites={sites} isNetworkOnline={isOnline} apiError={error} isLoading={isLoading} isFetching={isFetching} />
          <AddSiteButton onSiteAdded={handleSiteAdded} onClick={onAddSite} />
          {/* Hamburger button - mobile only */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex md:hidden items-center justify-center size-9 rounded border border-border bg-panel text-foreground hover:bg-foreground/5 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-14 z-40 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          {/* Menu panel */}
          <div className="relative bg-background border-b border-border shadow-lg">
            <ul className="flex flex-col p-4 space-y-1">
              {NAV.map((item) => {
                const active =
                  item.to === "/"
                    ? pathname === "/"
                    : pathname === item.to || pathname.startsWith(item.to + "/");
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`block px-4 py-3 rounded font-mono text-sm uppercase tracking-widest transition-colors ${
                        active
                          ? "bg-phosphor/10 text-phosphor border border-phosphor/30"
                          : "text-dim hover:text-foreground hover:bg-foreground/5 border border-transparent"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border p-4">
              <AddSiteButton
                onSiteAdded={() => {
                  setMobileMenuOpen(false);
                  handleSiteAdded();
                }}
                onClick={onAddSite}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
