"use client";

import { SubmitButton } from "@/components/submit-button";

interface DeleteAvailabilityButtonProps {
  action: (formData: FormData) => void;
  slotId: string;
}

export function DeleteAvailabilityButton({
  action,
  slotId,
}: DeleteAvailabilityButtonProps) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={slotId} />
      <SubmitButton
        type="submit"
        variant="destructive"
        size="sm"
        loadingText="Deleting..."
      >
        Delete
      </SubmitButton>
    </form>
  );
}
