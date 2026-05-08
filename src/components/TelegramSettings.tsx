import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MessageCircle,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Copy,
  Send,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { isElectron } from "@/lib/electron-notifications";
import { QRCodeSVG } from "qrcode.react";

// Generate random token for Telegram deep link
function generateToken(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function TelegramSettings() {
  const [mounted, setMounted] = useState(false);
  const [botUsername, setBotUsername] = useState("");
  const [botToken, setBotToken] = useState("");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkStatus, setLinkStatus] = useState<"idle" | "waiting" | "success" | "error">("idle");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(true);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Set mounted state on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load saved settings and bot info on mount
  useEffect(() => {
    if (!mounted) return;
    loadSettings();
    loadBotInfo();
  }, [mounted]);

  const loadBotInfo = async () => {
    if (!isElectron()) return;

    try {
      const result = await window.electronAPI.getTelegramBotInfo();
      if (result?.success) {
        setBotUsername(result.username || "");
        setBotToken(result.token || "");
      }
    } catch {
      // Silent fail
    }
  };

  const loadSettings = async () => {
    if (!isElectron()) return;

    try {
      const result = await window.electronAPI.loadSettings();
      if (result?.success && result.settings) {
        const settings = result.settings as Record<string, unknown>;
        if (settings.telegramChatId) {
          setTelegramChatId(settings.telegramChatId as string);
        }
        if (settings.telegramUsername) {
          setTelegramUsername(settings.telegramUsername as string);
        }
        // Load enabled state (default to true if not set)
        setTelegramEnabled(settings.telegramEnabled !== false);
      }
    } catch {
      // Silent fail
    }
  };

  // Start linking process
  const startLinking = () => {
    const token = generateToken();
    setLinkToken(token);
    setIsLinking(true);
    setLinkStatus("waiting");
    setMessage(null);

    // Store token temporarily in settings for verification
    storeLinkToken(token);

    // Start polling for updates
    startPolling(token);
  };

  // Store link token temporarily
  const storeLinkToken = async (token: string) => {
    if (!isElectron()) return;

    try {
      const currentSettings = await window.electronAPI.loadSettings();
      const settings: Record<string, unknown> =
        currentSettings?.success && currentSettings.settings ? { ...currentSettings.settings } : {};

      settings.telegramLinkToken = token;
      settings.telegramLinkExpires = Date.now() + 5 * 60 * 1000; // 5 minutes

      await window.electronAPI.saveSettings(settings);
    } catch {
      // Silent fail
    }
  };

  // Poll Telegram API for /start messages
  const startPolling = useCallback((expectedToken: string) => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes (5s intervals)

    pollRef.current = setInterval(async () => {
      attempts++;

      if (attempts > maxAttempts) {
        stopPolling();
        setLinkStatus("error");
        setMessage({ type: "error", text: "Linking timed out. Please try again." });
        return;
      }

      try {
        const updates = await checkTelegramUpdates(expectedToken);
        if (updates?.chatId) {
          // Success! Link the chat
          await linkTelegramChat(updates.chatId, updates.username);
          stopPolling();
          setLinkStatus("success");
          setTelegramChatId(updates.chatId);
          setTelegramUsername(updates.username || null);
          setMessage({ type: "success", text: `Connected to @${updates.username || "Telegram"}!` });
        }
      } catch {
        // Continue polling
      }
    }, 5000);
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsLinking(false);
  };

  // Check Telegram updates via Electron main process
  const checkTelegramUpdates = async (
    expectedToken: string,
  ): Promise<{ chatId: string; username?: string } | null> => {
    if (!isElectron()) return null;

    try {
      const result = await window.electronAPI.checkTelegramUpdates(expectedToken);
      if (result?.success && result.chatId) {
        return { chatId: result.chatId, username: result.username };
      }
      return null;
    } catch {
      return null;
    }
  };

  // Save linked chat ID
  const linkTelegramChat = async (chatId: string, username?: string) => {
    if (!isElectron()) return;

    const currentSettings = await window.electronAPI?.loadSettings();
    const settings: Record<string, unknown> =
      currentSettings?.success && currentSettings.settings ? { ...currentSettings.settings } : {};

    settings.telegramChatId = chatId;
    if (username) {
      settings.telegramUsername = username;
    }
    // Clear the link token
    delete settings.telegramLinkToken;
    delete settings.telegramLinkExpires;

    await window.electronAPI.saveSettings(settings);

    // Send confirmation message
    try {
      await window.electronAPI.sendTelegramMessage(
        chatId,
        "✅ <b>SiteGuardian Pro</b> connected successfully!\n\nYou'll now receive notifications when your sites go offline or come back online.",
      );
    } catch {
      // Silent fail - connection still works even if welcome message fails
    }
  };

  // Open Telegram deep link
  const openTelegramLink = async () => {
    if (!linkToken || !botUsername) return;

    const link = `https://t.me/${botUsername}?start=${linkToken}`;

    if (isElectron()) {
      await window.electronAPI.openExternal(link);
    } else {
      window.open(link, "_blank");
    }
  };

  // Toggle Telegram notifications
  const handleToggleEnabled = async (enabled: boolean) => {
    if (!isElectron()) return;

    try {
      const currentSettings = await window.electronAPI?.loadSettings();
      const settings: Record<string, unknown> =
        currentSettings?.success && currentSettings.settings ? { ...currentSettings.settings } : {};

      settings.telegramEnabled = enabled;
      await window.electronAPI.saveSettings(settings);
      setTelegramEnabled(enabled);
      setMessage({
        type: "success",
        text: enabled ? "Telegram notifications enabled" : "Telegram notifications disabled",
      });
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    }
  };

  // Test Telegram connection
  const handleTestConnection = async () => {
    if (!isElectron() || !telegramChatId) return;

    setIsTesting(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.sendTelegramMessage(
        telegramChatId,
        "🧪 <b>Test Message</b>\n\nYour Telegram connection is working! You'll receive site notifications here.",
      );

      if (result?.success) {
        setMessage({ type: "success", text: "Test message sent! Check your Telegram." });
      } else {
        setMessage({ type: "error", text: result?.error || "Failed to send test message" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to send test message: " + String(error) });
    } finally {
      setIsTesting(false);
    }
  };

  // Disconnect Telegram
  const handleDisconnect = async () => {
    if (!isElectron()) return;

    try {
      const currentSettings = await window.electronAPI.loadSettings();
      const settings: Record<string, unknown> =
        currentSettings?.success && currentSettings.settings ? { ...currentSettings.settings } : {};

      delete settings.telegramChatId;
      delete settings.telegramUsername;
      delete settings.telegramLinkToken;
      delete settings.telegramLinkExpires;

      await window.electronAPI.saveSettings(settings);

      setTelegramChatId(null);
      setTelegramUsername(null);
      setLinkToken(null);
      setLinkStatus("idle");
      setMessage({ type: "success", text: "Telegram disconnected" });
    } catch (error) {
      setMessage({ type: "error", text: String(error) });
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const deepLink =
    linkToken && botUsername ? `https://t.me/${botUsername}?start=${linkToken}` : null;

  // Browser view - show instructions
  if (!mounted || !isElectron()) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-500" />
            Telegram Notifications
          </CardTitle>
          <CardDescription>Available in the desktop app only</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Telegram notifications require the desktop application. Download the app to enable
              this feature.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-500" />
          Telegram Notifications
          <Badge variant={telegramChatId ? "default" : "outline"} className="ml-auto">
            {telegramChatId ? "Connected" : "Not Connected"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Get instant alerts via Telegram when sites go offline or come back online
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        {telegramChatId && (
          <div className="flex items-center justify-between p-4 border rounded-md">
            <div className="space-y-0.5">
              <Label htmlFor="telegram-toggle" className="font-medium">
                Telegram Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                {telegramEnabled
                  ? "Enabled - you will receive alerts"
                  : "Disabled - no alerts will be sent"}
              </p>
            </div>
            <Switch
              id="telegram-toggle"
              checked={telegramEnabled}
              onCheckedChange={handleToggleEnabled}
            />
          </div>
        )}

        {/* Connection Status */}
        {telegramChatId && (
          <Alert className="bg-green-500/10 border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <AlertDescription className="flex items-center justify-between">
              <div>
                <span className="font-medium">Connected to Telegram</span>
                {telegramUsername && (
                  <p className="text-sm text-muted-foreground">@{telegramUsername}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Test
                </Button>
                <Button variant="outline" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Messages */}
        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Linking UI */}
        {!telegramChatId && (
          <div className="border rounded-md p-4 space-y-4">
            <div className="space-y-1">
              <h4 className="font-medium">Connect Your Telegram</h4>
              <p className="text-sm text-muted-foreground">
                Link your Telegram account to receive site status notifications
              </p>
            </div>

            {!isLinking ? (
              <Button onClick={startLinking} className="w-full">
                <MessageCircle className="w-4 h-4 mr-2" />
                Connect Telegram
              </Button>
            ) : (
              <div className="space-y-4">
                {/* QR Code */}
                {deepLink && (
                  <div className="flex flex-col items-center gap-2">
                    <QRCodeSVG value={deepLink} size={180} />
                    <p className="text-xs text-muted-foreground">Scan with your phone camera</p>
                  </div>
                )}

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                {/* Button */}
                <Button onClick={openTelegramLink} variant="outline" className="w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in Telegram
                </Button>

                {/* Copy link */}
                <div className="flex gap-2">
                  <Input value={deepLink || ""} readOnly className="text-xs" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (deepLink) {
                        navigator.clipboard.writeText(deepLink);
                        setMessage({ type: "success", text: "Link copied!" });
                      }
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>

                {/* Instructions */}
                <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                  <p className="font-medium">Steps:</p>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                    <li>Click button above or scan QR code</li>
                    <li>
                      Tap <b>Start</b> in Telegram (one tap only)
                    </li>
                    <li>Return here - you'll be connected automatically</li>
                  </ol>
                </div>

                {/* Status */}
                {linkStatus === "waiting" && (
                  <div className="flex items-center gap-2 text-sm text-amber-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Waiting for you to tap Start in Telegram...
                  </div>
                )}

                {/* Cancel */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    stopPolling();
                    setLinkStatus("idle");
                    setLinkToken(null);
                  }}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Help */}
        <div className="pt-4 border-t text-sm text-muted-foreground space-y-2">
          <p className="font-medium">What you'll get:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Instant alerts when sites go offline</li>
            <li>Notifications when sites come back online</li>
            <li>Health check failure alerts</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
