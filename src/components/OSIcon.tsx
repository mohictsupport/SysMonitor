import { Monitor, Server, Wifi, Shield } from "lucide-react";

interface OSIconProps {
  os?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function OSIcon({ os = "", size = "sm", showLabel = false }: OSIconProps) {
  // Normalize OS string
  const osLower = os.toLowerCase();
  
  // Determine icon and label
  let Icon = Server;
  let label = os || "Unknown";
  let colorClass = "text-dim";
  
  if (osLower.includes("windows")) {
    Icon = Monitor;
    label = "Windows";
    colorClass = "text-blue-400";
  } else if (osLower.includes("linux")) {
    Icon = Server;
    label = "Linux";
    colorClass = "text-amber";
  } else if (osLower.includes("darwin") || osLower.includes("mac")) {
    Icon = Monitor;
    label = "macOS";
    colorClass = "text-phosphor";
  } else if (osLower.includes("pfsense") || osLower.includes("freebsd")) {
    Icon = Shield;
    label = "pfSense";
    colorClass = "text-amber";
  } else if (osLower.includes("android")) {
    Icon = Wifi;
    label = "Android";
    colorClass = "text-green-400";
  } else if (osLower.includes("ios")) {
    Icon = Wifi;
    label = "iOS";
    colorClass = "text-blue-300";
  }

  // Size classes
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  if (showLabel) {
    return (
      <span className="flex items-center gap-1.5" title={os || "Unknown OS"}>
        <Icon className={`${sizeClasses[size]} ${colorClass}`} />
        <span className="text-[10px] text-dim">{label}</span>
      </span>
    );
  }

  return (
    <span title={os || "Unknown OS"} className="inline-flex">
      <Icon className={`${sizeClasses[size]} ${colorClass}`} />
    </span>
  );
}

// Get OS label only (without icon)
export function getOSLabel(os?: string): string {
  if (!os) return "Unknown";
  
  const osLower = os.toLowerCase();
  
  if (osLower.includes("windows")) return "Windows";
  if (osLower.includes("linux")) return "Linux";
  if (osLower.includes("darwin") || osLower.includes("mac")) return "macOS";
  if (osLower.includes("pfsense")) return "pfSense";
  if (osLower.includes("freebsd")) return "FreeBSD";
  if (osLower.includes("android")) return "Android";
  if (osLower.includes("ios")) return "iOS";
  
  return os;
}
