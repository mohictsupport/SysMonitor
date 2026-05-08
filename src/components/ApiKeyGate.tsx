import { Link } from "@tanstack/react-router";
import { Key, Settings, ShieldAlert } from "lucide-react";
import { Button } from "./ui/button";

interface ApiKeyGateProps {
  title?: string;
  description?: string;
}

export function ApiKeyGate({ 
  title = "API Key Configuration Required", 
  description = "To access monitoring data and reports, you need to configure your NetBird API key in the settings." 
}: ApiKeyGateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-background border border-border shadow-2xl">
          <Key className="w-10 h-10 text-primary animate-pulse" />
          <div className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-destructive text-destructive-foreground shadow-lg">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>
      </div>
      
      <h2 className="text-2xl font-bold tracking-tight mb-2">{title}</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        {description}
      </p>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <Link to="/settings">
          <Button size="lg" className="gap-2 px-8">
            <Settings className="w-4 h-4" />
            Go to Settings
          </Button>
        </Link>
        <Button variant="outline" size="lg" onClick={() => window.location.reload()}>
          Check Again
        </Button>
      </div>
      
      <div className="mt-12 p-4 rounded-xl bg-muted/50 border border-border max-w-sm">
        <p className="text-xs text-muted-foreground text-left">
          <strong>Why is this needed?</strong><br />
          Your API key is used to securely fetch peer status and uptime data from NetBird and sync it with your local dashboard.
        </p>
      </div>
    </div>
  );
}
