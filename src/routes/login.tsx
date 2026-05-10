import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { auth, signInWithEmailAndPassword, needsPasswordChange } from "@/lib/firebase";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — SysMonitor" },
      {
        name: "description",
        content: "Sign in to access settings.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Check if user needs to change password (first time login with default password)
      const needsChange = await needsPasswordChange(userCredential.user.uid);
      
      if (needsChange) {
        // Show password change dialog
        setShowChangePassword(true);
      } else {
        // User has already changed password, proceed to settings
        toast.success("Logged in successfully");
        navigate({ to: "/settings" });
      }
    } catch (error: any) {
      // Map Firebase error codes to user-friendly messages
      const errorCode = error.code;
      let errorMessage = "Login failed";

      switch (errorCode) {
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          errorMessage = "Invalid email or password";
          break;
        case "auth/invalid-email":
          errorMessage = "Please enter a valid email address";
          break;
        case "auth/user-disabled":
          errorMessage = "This account has been disabled";
          break;
        case "auth/too-many-requests":
          errorMessage = "Too many attempts. Please try again later";
          break;
        default:
          errorMessage = "Login failed. Please try again";
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium tracking-tight">SysMonitor</h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            Authentication Required
          </p>
        </div>

        <form onSubmit={handleLogin} className="border border-border bg-panel p-6 space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="font-mono text-[10px] uppercase tracking-widest text-dim"
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="font-mono text-[12px]"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="font-mono text-[10px] uppercase tracking-widest text-dim"
            >
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="font-mono text-[12px] pr-10"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full font-mono text-[11px] uppercase tracking-widest bg-phosphor hover:bg-phosphor/90 text-void"
          >
            {isLoading ? "Signing in..." : "Sign In to Settings"}
          </Button>

          <div className="pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => navigate({ to: "/" })}
              className="w-full font-mono text-[11px] uppercase tracking-widest"
            >
              Go to Dashboard
            </Button>
            <p className="mt-2 text-center font-mono text-[9px] text-dim">
              Access dashboard without signing in
            </p>
          </div>
        </form>
      </div>

      {/* Password Change Dialog */}
      <ChangePasswordDialog
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        onSuccess={() => {
          toast.success("Password changed successfully! Please log in with your new password.");
          setShowChangePassword(false);
          // Clear password field so they re-enter with new password
          setPassword("");
        }}
      />
    </div>
  );
}
