"use client";

import { Loader2, LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SignOutButtonProps {
  variant?: "ghost" | "outline";
  size?: "icon" | "default";
  className?: string;
}

export function SignOutButton({
  variant = "ghost",
  size = "icon",
  className,
}: SignOutButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      variant={variant}
      size={size}
      type="submit"
      disabled={pending}
      className={className}
    >
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          {size !== "icon" && <LogOut className="h-5 w-5 mr-2" />}
          <LogOut className={`h-5 w-5 ${size !== "icon" ? "hidden" : ""}`} />
          {size !== "icon" && "Sign Out"}
        </>
      )}
    </Button>
  );
}
