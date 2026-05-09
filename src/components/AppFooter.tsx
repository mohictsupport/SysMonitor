import { Heart } from "lucide-react";

// Get version from package.json at build time
const APP_VERSION = "2.0.9";
const CURRENT_YEAR = 2026;

export function AppFooter() {
  return (
    <footer className="border-t border-border bg-panel px-4 py-2">
      <div className="flex items-center justify-center gap-1 text-[11px] text-dim">
        <span>Built with</span>
        <Heart className="h-3 w-3 fill-alert text-alert" />
        <span className="font-medium text-foreground">by Ministry of Health (MOH) ICT</span>
        <span className="mx-1">•</span>
        <span className="font-medium">SysMonitor</span>
        <span className="mx-1">•</span>
        <span>v{APP_VERSION}</span>
        <span className="mx-1">•</span>
        <span>© 2025-{CURRENT_YEAR}</span>
      </div>
    </footer>
  );
}
