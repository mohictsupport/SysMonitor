import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Key,
  Save,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { isElectron } from "@/lib/electron-notifications";
import { AccessCodeModal } from "./AccessCodeModal";
import { useAccessKey } from "@/lib/use-access-key";

interface NetBirdApiSettingsProps {
  onSave?: () => void;
  onClearCacheAndRefetch?: () => void;
}

export function NetBirdApiSettings({ onSave, onClearCacheAndRefetch }: NetBirdApiSettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [apiKeyExpiry, setApiKeyExpiry] = useState<string>("");
  const [showInputFields, setShowInputFields] = useState(false);
  
  // Access code protection
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const { verifyAccessKey } = useAccessKey();
  useEffect(() => {
    setIsElectronApp(isElectron());
    checkStoredKey();
  }, []);

  const checkStoredKey = async () => {
    if (isElectron()) {
      try {
        const result = await window.electronAPI.hasApiKey();
        const hasKey = result?.hasKey || false;
        setHasStoredKey(hasKey);

        // Update sync hint
        if (hasKey) {
          localStorage.setItem("netbird_api_key_configured", "true");
        } else {
          localStorage.removeItem("netbird_api_key_configured");
        }

        // Load expiry date from settings
        const settingsResult = await window.electronAPI.loadSettings();
        if (settingsResult?.success && settingsResult.settings?.apiKeyExpiry) {
          setApiKeyExpiry(String(settingsResult.settings.apiKeyExpiry));
        }
      } catch {
        setHasStoredKey(false);
      }
    } else {
      // Browser mode
      const localKey = localStorage.getItem("netbird_api_key");
      setHasStoredKey(!!localKey);
    }
  };

  // Calculate days until expiry
  const getDaysUntilExpiry = () => {
    if (!apiKeyExpiry) return null;
    const expiryDate = new Date(apiKeyExpiry);
    const now = new Date();
    const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil;
  };

  // Get expiry status display
  const getExpiryStatus = () => {
    const days = getDaysUntilExpiry();
    if (days === null) return null;

    if (days < 0) {
      return {
        text: `Expired ${Math.abs(days)} days ago`,
        color: "text-red-500",
        bg: "bg-red-500/10 border-red-500/20",
        alert: true,
      };
    } else if (days <= 5) {
      return {
        text: `${days} days left - Expires soon!`,
        color: "text-red-500",
        bg: "bg-red-500/10 border-red-500/20",
        alert: true,
      };
    } else if (days <= 30) {
      return {
        text: `${days} days remaining`,
        color: "text-amber-500",
        bg: "bg-amber-500/10 border-amber-500/20",
        alert: false,
      };
    }
    return {
      text: `${days} days remaining`,
      color: "text-green-500",
      bg: "bg-green-500/10 border-green-500/20",
      alert: false,
    };
  };

  // Check if we should show daily warning (within 5 days of expiry)
  const shouldShowDailyWarning = () => {
    const days = getDaysUntilExpiry();
    return days !== null && days <= 5 && days >= 0;
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setMessage({ type: "error", text: "Please enter an API key" });
      return;
    }

    if (!isElectron()) {
      setMessage({ type: "error", text: "API key storage only available in desktop app" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Save API key
      const result = await window.electronAPI.saveApiKey(apiKey.trim());

      if (result?.success) {
        // Save expiry date to settings
        if (apiKeyExpiry) {
          const currentSettings = await window.electronAPI.loadSettings();
          const settings = currentSettings?.success ? currentSettings.settings : {};
          await window.electronAPI.saveSettings({
            ...settings,
            apiKeyExpiry,
          });
        }

        // Update sync hint
        localStorage.setItem("netbird_api_key_configured", "true");

        setMessage({ type: "success", text: "API key saved securely!" });
        setApiKey("");
        setHasStoredKey(true);
        setShowInputFields(false); // Hide input fields after saving
        
        // Dispatch event for reactive components
        window.dispatchEvent(new CustomEvent("netbird-api-key-changed"));
        
        // Clear cache and refetch sites with new API key
        onClearCacheAndRefetch?.();
        
        // Also trigger sync for backward compatibility
        onSave?.();
      } else {
        setMessage({ type: "error", text: result?.error || "Failed to save API key" });
      }
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isElectron()) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.deleteApiKey();

      if (result?.success) {
        // Clear expiry date from settings
        const currentSettings = await window.electronAPI.loadSettings();
        const settings: Record<string, unknown> =
          currentSettings?.success && currentSettings.settings
            ? { ...currentSettings.settings }
            : {};
        delete settings.apiKeyExpiry;
        await window.electronAPI.saveSettings(settings);

        // Update sync hint
        localStorage.removeItem("netbird_api_key_configured");

        setMessage({ type: "success", text: "API key deleted" });
        setHasStoredKey(false);
        setApiKey("");
        setApiKeyExpiry("");
        
        // Dispatch event for reactive components
        window.dispatchEvent(new CustomEvent("netbird-api-key-changed"));
        
        // Clear cache and refetch sites after removing API key
        onClearCacheAndRefetch?.();
      } else {
        setMessage({ type: "error", text: result?.error || "Failed to delete API key" });
      }
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    } finally {
      setLoading(false);
    }
  };

  // For browser - show instructions
  if (!isElectronApp) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            NetBird API Configuration
          </CardTitle>
          <CardDescription>
            Browser mode - API key must be configured in desktop app for secure storage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              For security, API keys are only stored in the desktop application. Download the
              SysMonitor desktop app to use automatic NetBird integration.
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            In the desktop app, you can securely store your NetBird API key using OS-level
            encryption.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          NetBird API Configuration
          <Badge variant={hasStoredKey ? "default" : "outline"} className="ml-auto">
            {hasStoredKey ? "Configured" : "Not Configured"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Connect to your NetBird network to automatically import and monitor your sites
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status - Only show when key is stored */}
        {hasStoredKey && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              API key is securely stored on this device
            </AlertDescription>
          </Alert>
        )}

        {/* API Key Status with Expiry - Prominent warning when close to expiry */}
        {hasStoredKey && (
          <div
            className={`border rounded-md p-4 space-y-2 ${getExpiryStatus()?.bg || "bg-muted/50"}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="w-4 h-4" />
              <span>API Key Status</span>
            </div>
            <div className="text-sm space-y-2">
              <p className="text-green-600 dark:text-green-400">✓ API key is stored and active</p>
              {apiKeyExpiry && getExpiryStatus() ? (
                <>
                  <p className={`font-medium ${getExpiryStatus()?.color}`}>
                    Expires: {new Date(apiKeyExpiry).toLocaleDateString()} (
                    {getExpiryStatus()?.text})
                  </p>
                  {shouldShowDailyWarning() && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTriangle className="w-4 h-4" />
                      <AlertDescription>
                        Your API key expires in {getDaysUntilExpiry()} days! Please renew it in your
                        NetBird Dashboard and update it here to avoid service interruption.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ No expiry date set. Click "Update Key" below to add one.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                The API key is securely stored in your OS credential store.
              </p>
            </div>

            {/* Update Key Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAccessModalOpen(true);
                setAccessError(null);
              }}
              className="mt-2"
            >
              Update Key / Change Expiry
            </Button>
          </div>
        )}

        {/* Access Code Modal */}
        <AccessCodeModal
          isOpen={isAccessModalOpen}
          onClose={() => {
            setIsAccessModalOpen(false);
            setAccessError(null);
          }}
          onVerify={(password) => {
            if (verifyAccessKey(password)) {
              setIsAccessModalOpen(false);
              setAccessError(null);
              setShowInputFields(true);
            } else {
              setAccessError("Incorrect access code");
            }
          }}
          error={accessError}
          title="Update API Key - Access Required"
          description="Please enter the access code to update your NetBird API key."
        />

        {/* Message */}
        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* API Key Input - Only show when no key stored or user wants to update */}
        {(!hasStoredKey || showInputFields) && (
          <>
            <div className="space-y-2">
              <Label htmlFor="api-key">NetBird API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasStoredKey
                        ? "Enter new key to replace existing"
                        : "Enter your NetBird API key"
                    }
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Your API key is encrypted and stored securely using your operating system's
                keychain.
              </p>
            </div>

            {/* Expiry Date Input */}
            <div className="space-y-2">
              <Label htmlFor="api-expiry">API Key Expiry Date (Optional)</Label>
              <Input
                id="api-expiry"
                type="date"
                value={apiKeyExpiry}
                onChange={(e) => setApiKeyExpiry(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Set the expiry date from your NetBird dashboard to get expiration warnings.
              </p>
            </div>
          </>
        )}

        {/* Actions - Only show when input fields are visible */}
        {(!hasStoredKey || showInputFields) && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={loading || !apiKey.trim()}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Saving..." : "Save API Key"}
            </Button>

            {hasStoredKey && showInputFields && (
              <Button variant="ghost" onClick={() => setShowInputFields(false)} disabled={loading}>
                Cancel
              </Button>
            )}

            {hasStoredKey && (
              <Button variant="outline" onClick={handleDelete} disabled={loading}>
                <Trash2 className="w-4 h-4 mr-2" />
                Remove Key
              </Button>
            )}
          </div>
        )}

        {/* Help */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">How to get your API key:</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Log in to your NetBird Dashboard</li>
            <li>Go to Settings → Personal Access Tokens</li>
            <li>Click "Create New Token"</li>
            <li>Copy the token and paste it here</li>
          </ol>
          <Button
            variant="link"
            size="sm"
            className="mt-2 h-auto p-0"
            onClick={() => window.open("https://app.netbird.io/settings/tokens", "_blank")}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Open NetBird Dashboard
          </Button>
        </div>

        {/* Security Note */}
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
          <strong>Security:</strong> Your API key is encrypted using your OS credential store
          (Windows Credential Manager, macOS Keychain, or Linux Secret Service). The key is never
          stored in plain text and can only be accessed by this application on your device.
        </div>
      </CardContent>
    </Card>
  );
}

export default NetBirdApiSettings;
