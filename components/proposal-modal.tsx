"use client";

import type { EventType } from "@prisma/client";
import { addMinutes, format, startOfDay } from "date-fns";
import { CheckCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ProposalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventType: EventType;
}

export function ProposalModal({
  open,
  onOpenChange,
  eventType,
}: ProposalModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedDate(undefined);
      setSubmitting(false);
      setSubmitted(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const proposedTime = formData.get("proposedTime") as string;

    if (!proposedTime || !/^\d{2}:\d{2}$/.test(proposedTime)) {
      toast.error("Please enter a valid time (HH:mm)");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/bookings/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId: eventType.id,
          guestName: formData.get("guestName"),
          guestEmail: formData.get("guestEmail"),
          guestNotes: formData.get("guestNotes") || undefined,
          proposedDate: format(selectedDate, "yyyy-MM-dd"),
          proposedTime,
          proposalMessage: formData.get("proposalMessage") || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit proposal");
      }

      setSubmitted(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit proposal";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const minDate = startOfDay(
    addMinutes(new Date(), eventType.minimumNoticeHours * 60),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Propose a custom time</DialogTitle>
          <DialogDescription>
            Can&apos;t find a slot that works? Propose any date and time — the
            host will review and confirm.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle className="w-14 h-14 text-green-500" />
            <div>
              <p className="text-lg font-semibold">Proposal sent!</p>
              <p className="text-sm text-muted-foreground mt-1">
                The host will review your request and get back to you by email.
              </p>
            </div>
            <Button onClick={() => handleOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium mb-3">Proposed date</p>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < minDate}
                  className="rounded-md border"
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="proposedTime">Proposed time</Label>
                  <Input
                    id="proposedTime"
                    name="proposedTime"
                    type="time"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Times are shown in the host&apos;s timezone
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposalGuestName">Name *</Label>
                  <Input
                    id="proposalGuestName"
                    name="guestName"
                    type="text"
                    required
                    placeholder="John Doe"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposalGuestEmail">Email *</Label>
                  <Input
                    id="proposalGuestEmail"
                    name="guestEmail"
                    type="email"
                    required
                    placeholder="john@example.com"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposalMessage">
                Message to host (optional)
              </Label>
              <Textarea
                id="proposalMessage"
                name="proposalMessage"
                placeholder="Why this time works for you, or any context that might help..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposalGuestNotes">Notes (optional)</Label>
              <Textarea
                id="proposalGuestNotes"
                name="guestNotes"
                placeholder="Any additional information..."
                rows={2}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !selectedDate}
            >
              {submitting ? "Sending proposal..." : "Send proposal"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
