import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, AlertCircle } from "lucide-react";

interface AccessCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (password: string) => void;
  error?: string | null;
  title?: string;
  description?: string;
}

export function AccessCodeModal({
  isOpen,
  onClose,
  onVerify,
  error,
  title = "Access Required",
  description = "Please enter the access code to continue.",
}: AccessCodeModalProps) {
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Validation constants
  const MIN_LENGTH = 3;
  const MAX_LENGTH = 50;

  // Sanitize input - only allow alphanumeric and common special chars
  const sanitizeInput = useCallback((input: string): string => {
    // Remove any potentially dangerous characters (null bytes, control chars, etc.)
    // Allow: letters, numbers, spaces, and common punctuation
    return input.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/? ]/g, "").slice(0, MAX_LENGTH);
  }, []);

  const validatePassword = useCallback((pwd: string): string | null => {
    const trimmed = pwd.trim();
    if (trimmed.length === 0) {
      return "Access code is required";
    }
    if (trimmed.length < MIN_LENGTH) {
      return `Access code must be at least ${MIN_LENGTH} characters`;
    }
    if (trimmed.length > MAX_LENGTH) {
      return `Access code must not exceed ${MAX_LENGTH} characters`;
    }
    return null;
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedPassword = password.trim();
    const validationError = validatePassword(trimmedPassword);

    if (validationError) {
      setLocalError(validationError);
      return;
    }

    onVerify(trimmedPassword);
    // Clear on success - parent will close the modal
    setPassword("");
  };

  const handleClose = () => {
    setPassword("");
    setLocalError(null);
    onClose();
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeInput(e.target.value);
    setPassword(sanitized);
    setLocalError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Access Code
              <span className="text-dim ml-2 font-normal">
                ({MIN_LENGTH}-{MAX_LENGTH} characters)
              </span>
            </label>
            <input
              type="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="Enter access code..."
              maxLength={MAX_LENGTH}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              className="w-full border border-border bg-void px-3 py-2 font-mono text-sm text-foreground outline-hidden focus:border-phosphor rounded-md"
              autoFocus
            />
            <p className="text-[10px] text-dim">
              Allowed: letters, numbers, spaces, and !@#$%^&*()_+-=[]{};':"\|,.&lt;&gt;/?
            </p>
          </div>

          {(error || localError) && (
            <div className="flex items-center gap-2 text-sm text-alert bg-alert/10 border border-alert/20 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              {error || localError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!password.trim()}
              className="bg-phosphor hover:bg-phosphor/90 text-void"
            >
              Verify
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
