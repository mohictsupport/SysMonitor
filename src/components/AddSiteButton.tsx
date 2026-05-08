import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AccessCodeModal } from "./AccessCodeModal";
import { useAccessKey } from "@/lib/use-access-key";

interface AddSiteButtonProps {
  onSiteAdded?: () => void;
  onClick?: () => void;
}

export function AddSiteButton({ onSiteAdded, onClick }: AddSiteButtonProps) {
  const navigate = useNavigate();
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const { verifyAccessKey, loading: accessKeyLoading } = useAccessKey();

  const handleClick = () => {
    // Show access code modal first
    setIsAccessModalOpen(true);
    setAccessError(null);
  };

  const handleVerifyAccess = (password: string) => {
    if (verifyAccessKey(password)) {
      // Access granted - proceed with adding site
      setIsAccessModalOpen(false);
      setAccessError(null);

      console.log("AddSiteButton clicked - access granted");
      onSiteAdded?.();

      // If onClick prop is provided (for modal), use it
      if (onClick) {
        onClick();
      } else {
        // Navigate to /sites with hash param for modal (works with Electron hash routing)
        navigate({
          to: "/sites",
          search: { add: "true" },
        });
      }
    } else {
      // Access denied
      setAccessError("Incorrect access code");
    }
  };

  return (
    <>
      <Button
        onClick={handleClick}
        className="bg-phosphor hover:bg-phosphor/90 text-void gap-2 cursor-pointer"
        size="sm"
        disabled={accessKeyLoading}
      >
        <Plus className="w-4 h-4" />
        Add Site
      </Button>

      <AccessCodeModal
        isOpen={isAccessModalOpen}
        onClose={() => {
          setIsAccessModalOpen(false);
          setAccessError(null);
        }}
        onVerify={handleVerifyAccess}
        error={accessError}
        title="Add Site - Access Required"
        description="Please enter the access code to add a new site."
      />
    </>
  );
}
