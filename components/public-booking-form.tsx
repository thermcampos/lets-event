"use client";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PublicBookingFormProps {
  action: (formData: FormData) => void;
  eventTypeId: string;
  duration: number;
  startTime: string;
}

export function PublicBookingForm({
  action,
  eventTypeId,
  duration,
  startTime,
}: PublicBookingFormProps) {
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="eventTypeId" value={eventTypeId} />
      <input type="hidden" name="duration" value={duration} />
      <input type="hidden" name="startTime" value={startTime} />

      <div className="space-y-2">
        <Label htmlFor="guestName">Your Name *</Label>
        <Input
          id="guestName"
          name="guestName"
          placeholder="John Doe"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="guestEmail">Your Email *</Label>
        <Input
          id="guestEmail"
          name="guestEmail"
          type="email"
          placeholder="john@example.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="guestNotes">Additional Notes</Label>
        <Textarea
          id="guestNotes"
          name="guestNotes"
          placeholder="Let us know if you have any specific topics or questions..."
          rows={4}
        />
      </div>

      <SubmitButton
        type="submit"
        className="w-full"
        loadingText="Confirming..."
      >
        Confirm Booking
      </SubmitButton>
    </form>
  );
}
