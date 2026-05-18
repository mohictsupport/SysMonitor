import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Loader2,
  Shield,
  Key,
  Save,
  Trash2,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Custom type definitions for Electron's webview element to prevent JSX compilation issues.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLWebViewElement> & {
          src?: string;
          preload?: string;
          nodeintegration?: string;
          disablewebsecurity?: string;
          allowpopups?: string;
          webpreferences?: string;
        },
        HTMLWebViewElement
      >;
    }
  }
}

export const Route = createLazyFileRoute("/open-site")({
  head: () => ({
    meta: [
      { title: "Open Site — SysMonitor" },
      {
        name: "description",
        content: "Open site admin portal securely via NetBird tunnel.",
      },
    ],
  }),
  component: OpenSitePage,
});

interface SiteCredential {
  username?: string;
  password?: string;
}

const LOCAL_STORAGE_KEY = "sysmonitor_pfsense_credentials";

function OpenSitePage() {
  const [url, setUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  
  // Credentials Manager State
  const [isCredManagerOpen, setIsCredManagerOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [autofillSuggested, setAutofillSuggested] = useState(false);
  const [hasAutofilled, setHasAutofilled] = useState(false);
  const [detectedCreds, setDetectedCreds] = useState<SiteCredential | null>(null);
  const [detectionType, setDetectionType] = useState<"save" | "update" | null>(null);

  const webviewRef = useRef<any>(null);

  // Parse search params on mount and hash/path change
  useEffect(() => {
    const parseParams = () => {
      try {
        const hash = window.location.hash;
        const searchStr = hash.includes("?")
          ? hash.split("?")[1]
          : window.location.search.substring(1);
        
        const params = new URLSearchParams(searchStr);
        const parsedUrl = params.get("url") || "";
        const parsedName = params.get("name") || "Site Dashboard";
        
        setUrl(parsedUrl);
        setSiteName(parsedName);
      } catch (e) {
        console.error("Failed to parse site query params:", e);
        toast.error("Invalid URL parameters");
      }
    };

    parseParams();
    
    // Listen to location changes (for reactive updates)
    window.addEventListener("hashchange", parseParams);
    return () => window.removeEventListener("hashchange", parseParams);
  }, []);

  // Load Credentials Helper
  const getSavedCredentials = (): SiteCredential | null => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const savedCreds = getSavedCredentials();
  const hasSavedCreds = !!(savedCreds?.username && savedCreds?.password);

  // Initialize input fields when cred manager opens or saved state changes
  useEffect(() => {
    if (savedCreds) {
      setUsernameInput(savedCreds.username || "");
      setPasswordInput(savedCreds.password || "");
    } else {
      setUsernameInput("");
      setPasswordInput("");
    }
  }, [isCredManagerOpen]);

  // Check for autofill suggestion
  const checkForAutofill = () => {
    if (hasSavedCreds && !hasAutofilled) {
      setAutofillSuggested(true);
    } else {
      setAutofillSuggested(false);
    }
  };

  // Webview load event handlers
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => {
      setIsLoading(true);
    };

    const handleStopLoading = () => {
      setIsLoading(false);
    };

    const handleFinishLoad = () => {
      const backAvail = webview.canGoBack();
      const fwdAvail = webview.canGoForward();
      setIsLoading(false);
      setCanGoBack(backAvail);
      setCanGoForward(fwdAvail);
    };

    const handleDomReady = () => {
      const backAvail = webview.canGoBack();
      const fwdAvail = webview.canGoForward();
      setCanGoBack(backAvail);
      setCanGoForward(fwdAvail);
      checkForAutofill();

      // Inject robust credential detection script
      const detectionScript = `
        (() => {
          const captureCreds = (username, password) => {
            if (password) {
              console.log("__sysmon_login__:" + JSON.stringify({ username, password }));
            }
          };

          // 1. Intercept standard form submit events
          document.addEventListener('submit', (e) => {
            const form = e.target;
            if (!form) return;
            const passwordInput = form.querySelector('input[type="password"]');
            if (passwordInput && passwordInput.value) {
              const usernameInput = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
              const username = usernameInput ? usernameInput.value : '';
              const password = passwordInput.value;
              captureCreds(username, password);
            }
          });

          // 2. Intercept click events on action/submit buttons
          document.addEventListener('click', (e) => {
            const button = e.target.closest('button, input[type="submit"], input[type="button"], a.btn');
            if (button) {
              // Wait slightly for input values to sync to DOM
              setTimeout(() => {
                const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
                const activePassword = passwordInputs.find(i => i.value);
                if (activePassword) {
                  const usernameInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input:not([type])'));
                  const activeUsername = usernameInputs.find(i => i.value) || usernameInputs[0];
                  const username = activeUsername ? activeUsername.value : '';
                  const password = activePassword.value;
                  captureCreds(username, password);
                }
              }, 100);
            }
          });

          // 3. Intercept Enter key submissions
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const activeElement = document.activeElement;
              if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'BUTTON')) {
                setTimeout(() => {
                  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
                  const activePassword = passwordInputs.find(i => i.value);
                  if (activePassword) {
                    const usernameInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input:not([type])'));
                    const activeUsername = usernameInputs.find(i => i.value) || usernameInputs[0];
                    const username = activeUsername ? activeUsername.value : '';
                    const password = activePassword.value;
                    captureCreds(username, password);
                  }
                }, 100);
              }
            }
          });
        })();
      `;
      webview.executeJavaScript(detectionScript).catch(() => {});
    };

    const handleNavigate = () => {
      const backAvail = webview.canGoBack();
      const fwdAvail = webview.canGoForward();
      setCanGoBack(backAvail);
      setCanGoForward(fwdAvail);
    };

    const handleConsoleMessage = (e: any) => {
      const message = e.message;
      if (typeof message === "string" && message.startsWith("__sysmon_login__:")) {
        try {
          const credsJson = message.substring("__sysmon_login__:".length);
          const parsedCreds: SiteCredential = JSON.parse(credsJson);
          if (parsedCreds.username && parsedCreds.password) {
            handleDetectedCredentials(parsedCreds);
          }
        } catch (err) {
          console.error("Failed to parse guest login console message:", err);
        }
      }
    };

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-finish-load", handleFinishLoad);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("console-message", handleConsoleMessage);

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-finish-load", handleFinishLoad);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("console-message", handleConsoleMessage);
    };
  }, [url, hasSavedCreds, hasAutofilled]);

  const handleBack = () => {
    const webview = webviewRef.current;
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  };

  const handleForward = () => {
    const webview = webviewRef.current;
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  };

  const handleReload = () => {
    const webview = webviewRef.current;
    if (webview) {
      setHasAutofilled(false);
      webview.reload();
    }
  };

  const handleDetectedCredentials = (parsedCreds: SiteCredential) => {
    const saved = getSavedCredentials();
    if (!saved || !saved.username || !saved.password) {
      // Rule A: Completely new -> Ask to save
      setDetectedCreds(parsedCreds);
      setDetectionType("save");
      setAutofillSuggested(false);
    } else {
      // Rule B: Slight difference -> Ask to update
      if (parsedCreds.username !== saved.username || parsedCreds.password !== saved.password) {
        setDetectedCreds(parsedCreds);
        setDetectionType("update");
        setAutofillSuggested(false);
      }
      // Rule C: Same as saved -> Do nothing!
    }
  };

  const handleAcceptDetectedCredentials = () => {
    if (!detectedCreds || !detectedCreds.username || !detectedCreds.password) return;

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(detectedCreds));
      toast.success(
        detectionType === "save"
          ? "Saved admin credentials for Pfsense"
          : "Updated admin credentials for Pfsense"
      );
      
      // Sync form input state
      setUsernameInput(detectedCreds.username);
      setPasswordInput(detectedCreds.password);

      // Clear detection states
      setDetectedCreds(null);
      setDetectionType(null);
      
      setHasAutofilled(true);
      setAutofillSuggested(false);
    } catch (e) {
      toast.error("Failed to save credentials");
    }
  };

  const handleIgnoreDetectedCredentials = () => {
    setDetectedCreds(null);
    setDetectionType(null);
  };

  // Save Credentials Click
  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) {
      toast.error("Please fill in both username and password");
      return;
    }

    try {
      const creds: SiteCredential = {
        username: usernameInput,
        password: passwordInput,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(creds));
      toast.success("Saved admin credentials for Pfsense");
      setIsCredManagerOpen(false);
      checkForAutofill();
    } catch (e) {
      toast.error("Failed to save credentials");
    }
  };

  // Delete Credentials Click
  const handleDeleteCredentials = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      toast.success("Credentials deleted for Pfsense");
      setUsernameInput("");
      setPasswordInput("");
      setIsCredManagerOpen(false);
      setAutofillSuggested(false);
    } catch (e) {
      toast.error("Failed to delete credentials");
    }
  };

  // Autofill script DOM execution
  const handleAutofill = () => {
    const webview = webviewRef.current;
    if (!webview) return;

    const creds = getSavedCredentials();
    if (!creds || !creds.username || !creds.password) {
      toast.error("No saved credentials found");
      return;
    }

    const fillScript = `
      (function() {
        const user = ${JSON.stringify(creds.username)};
        const pass = ${JSON.stringify(creds.password)};
        
        // Focus and value set selectors
        const userInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user" i], input[name*="login" i], input[id*="user" i], input[id*="login" i]');
        const passInputs = document.querySelectorAll('input[type="password"], input[name*="pass" i], input[id*="pass" i]');
        
        let filled = false;
        
        const setVal = (el, val) => {
          if (!el) return;
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        
        // Find visible username input
        let targetUser = null;
        for (let el of userInputs) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && el.type !== 'hidden') {
            targetUser = el;
            break;
          }
        }
        if (!targetUser && userInputs.length > 0) targetUser = userInputs[0];
        
        // Find visible password input
        let targetPass = null;
        for (let el of passInputs) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && el.type !== 'hidden') {
            targetPass = el;
            break;
          }
        }
        if (!targetPass && passInputs.length > 0) targetPass = passInputs[0];
        
        if (targetUser) {
          setVal(targetUser, user);
          filled = true;
        }
        if (targetPass) {
          setVal(targetPass, pass);
          filled = true;
        }
        
        return filled;
      })()
    `;

    webview.executeJavaScript(fillScript)
      .then((filled: boolean) => {
        if (filled) {
          toast.success("Autofilled saved credentials for Pfsense");
          setHasAutofilled(true);
          setAutofillSuggested(false);
        } else {
          toast.warning("Login fields not found on active view");
        }
      })
      .catch((err: any) => {
        console.error("JavaScript inject failed:", err);
        toast.error("Failed to inject autofill credentials");
      });
  };

  return (
    <div 
      className="bg-void text-foreground select-none flex flex-col overflow-hidden w-full h-full"
    >
      {/* Dynamic Design Custom Web-browser Navbar */}
      <header className="flex items-center justify-between px-4 py-2 bg-panel/75 backdrop-blur-md border-b border-border z-50 flex-shrink-0">
        {/* Left Section: Back, Forward, Reload & Spinner */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleBack}
            disabled={!canGoBack}
            className="h-8 w-8 hover:bg-white/10 text-foreground/80 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleForward}
            disabled={!canGoForward}
            className="h-8 w-8 hover:bg-white/10 text-foreground/80 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Forward"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleReload}
            className="h-8 w-8 hover:bg-white/10 text-foreground/80 relative"
            title="Reload Portal"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 text-phosphor animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Center Section: Glassmorphic Secure Address Bar */}
        <div className="flex-1 max-w-xl mx-4">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-border/80 bg-void/40 backdrop-blur-sm shadow-inner text-[11px] font-mono text-foreground/90 w-full relative">
            <div className="flex items-center gap-2 overflow-hidden w-full">
              {/* Secure NetBird Shield Badge */}
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-cyan-950/40 text-cyan-400 border border-cyan-800/40 shrink-0">
                <Shield className="h-3 w-3 fill-cyan-400/10" />
                NetBird Secure
              </span>
              
              <div className="truncate shrink">
                <span className="font-semibold text-foreground">{siteName}</span>
              </div>
            </div>

            {/* Glowing active loading dot indicator */}
            {isLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Key Creds Manager & External Window Launch */}
        <div className="flex items-center gap-2 flex-shrink-0 relative">
          {/* Key Button (Highlighted if has credentials) */}
          <Button
            type="button"
            variant={hasSavedCreds ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setIsCredManagerOpen(!isCredManagerOpen)}
            className={`h-8 w-8 hover:bg-white/10 relative transition-colors ${
              hasSavedCreds ? "text-phosphor border border-phosphor/20 bg-phosphor/10 hover:bg-phosphor/20" : "text-foreground/80"
            }`}
            title="Credentials Remembrance Manager"
          >
            <Key className="h-4 w-4" />
            {hasSavedCreds && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-phosphor"></span>
            )}
          </Button>

          {/* Credentials Remembrance Panel Dropdown */}
          {isCredManagerOpen && (
            <div className="absolute right-0 top-10 w-72 bg-panel border border-border p-4 rounded-lg shadow-2xl backdrop-blur-xl z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
              <h3 className="font-semibold font-mono text-[10px] uppercase tracking-widest text-foreground/90 border-b border-border/60 pb-2 mb-3 flex items-center justify-between">
                <span>Credentials Vault</span>
                <span className="text-[9px] font-normal text-dim italic truncate max-w-[150px]">Pfsense</span>
              </h3>

              <form onSubmit={handleSaveCredentials} className="space-y-3">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-dim">Username / Login</label>
                  <Input
                    type="text"
                    placeholder="e.g. admin"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="h-8 font-mono text-xs bg-void border-border text-foreground"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-dim">Password</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="h-8 font-mono text-xs bg-void border-border text-foreground animate-none"
                    required
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="submit"
                    className="flex-1 h-8 font-mono text-[10px] uppercase tracking-wider bg-phosphor hover:bg-phosphor/90 text-void"
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save Creds
                  </Button>

                  {hasSavedCreds && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={handleDeleteCredentials}
                      className="h-8 w-8 shrink-0 hover:bg-destructive/90 text-destructive-foreground border border-destructive/20"
                      title="Delete Saved Credentials"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </form>

              {hasSavedCreds && (
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-dim font-mono">Found credentials:</span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleAutofill();
                      setIsCredManagerOpen(false);
                    }}
                    className="h-7 px-3 text-[10px] font-mono hover:bg-phosphor/10 hover:text-phosphor border-phosphor/30 hover:border-phosphor/60"
                  >
                    <Check className="h-3 w-3 mr-1 text-phosphor" />
                    Auto-fill
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Slide-Down Glassmorphic Auto-fill Suggestion Banner */}
      {autofillSuggested && (
        <div className="bg-phosphor/10 border-b border-phosphor/20 backdrop-blur-md text-phosphor px-4 py-2.5 flex items-center justify-between text-xs font-mono shadow-md animate-in slide-in-from-top duration-300 flex-shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Key className="h-4 w-4 shrink-0 animate-bounce" />
            <span className="truncate">
              Saved admin credentials found for <strong className="text-foreground">Pfsense</strong>.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAutofill}
              className="px-3 py-1 bg-phosphor hover:bg-phosphor/90 text-void font-bold text-[10px] uppercase tracking-wider rounded transition-colors shadow"
            >
              Auto-fill Now
            </button>
            <button
              onClick={() => setAutofillSuggested(false)}
              className="text-foreground/50 hover:text-foreground text-sm font-bold px-1"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Slide-Down Glassmorphic Auto-detection Suggestion Banner */}
      {detectedCreds && detectionType && (
        <div className="bg-phosphor/10 border-b border-phosphor/20 backdrop-blur-md text-phosphor px-4 py-2.5 flex items-center justify-between text-xs font-mono shadow-md animate-in slide-in-from-top duration-300 flex-shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Key className="h-4 w-4 shrink-0 animate-bounce" />
            <span className="truncate">
              {detectionType === "save" ? (
                <>
                  New admin credentials detected for <strong className="text-foreground">Pfsense</strong> (User: <span className="text-foreground font-semibold">{detectedCreds.username}</span>).
                </>
              ) : (
                <>
                  Different admin credentials detected for <strong className="text-foreground">Pfsense</strong> (User: <span className="text-foreground font-semibold">{detectedCreds.username}</span>).
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleAcceptDetectedCredentials}
              className="px-3 py-1 bg-phosphor hover:bg-phosphor/90 text-void font-bold text-[10px] uppercase tracking-wider rounded transition-colors shadow"
            >
              {detectionType === "save" ? "Save Credentials" : "Update Credentials"}
            </button>
            <button
              onClick={handleIgnoreDetectedCredentials}
              className="text-foreground/50 hover:text-foreground text-sm font-bold px-1"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Viewport Guest Browser Portal Container */}
      <div className="flex-1 w-full bg-void flex flex-col min-h-0 relative">
        {url ? (
          <webview
            ref={webviewRef}
            src={url}
            webpreferences="contextIsolation=yes, nodeIntegration=no"
            style={{ 
              flex: 1,
              width: "100%",
              height: "100%",
              display: "flex", // Keep internal flex layout context intact so that Chromium shadow DOM rendering does not collapse
              border: "none"
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
            <Loader2 className="h-8 w-8 text-phosphor animate-spin" />
            <p className="text-xs font-mono text-dim">Resolving site web portal route...</p>
          </div>
        )}

        {/* Visual Loading Overlay when Page starts loading */}
        {isLoading && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-void z-40 overflow-hidden">
            <div className="h-full bg-phosphor animate-pulse" style={{ width: "40%", animationDuration: "2s" }} />
          </div>
        )}
      </div>
    </div>
  );
}
