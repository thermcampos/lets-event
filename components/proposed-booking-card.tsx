"use client";

import type { Booking, EventType } from "@prisma/client";
import { format } from "date-fns";
import { Check, ChevronDown, ChevronUp, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ProposedBookingCardProps {
  booking: Booking & { eventType: EventType };
  onResponded: (id: string, action: "approve" | "decline") => void;
}

export function ProposedBookingCard({
  booking,
  onResponded,
}: ProposedBookingCardProps) {
  const [responding, setResponding] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const handleApprove = async () => {
    setResponding(true);
    try {
      const response = await fetch(`/api/bookings/${booking.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve proposal");
      }

      toast.success("Proposal approved — guest notified by email");
      onResponded(booking.id, "approve");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to approve proposal",
      );
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    setResponding(true);
    try {
      const response = await fetch(`/api/bookings/${booking.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decline",
          reason: declineReason.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to decline proposal");
      }

      toast.success("Proposal declined — guest notified by email");
      onResponded(booking.id, "decline");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to decline proposal",
      );
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{booking.eventType.title}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-medium">
              Pending proposal
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Proposed:{" "}
            <span className="font-medium text-foreground">
              {format(new Date(booking.startTime), "PPP 'at' p")}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Guest:</span>{" "}
            {booking.guestName}{" "}
            <a
              href={`mailto:${booking.guestEmail}`}
              className="text-primary hover:underline"
            >
              ({booking.guestEmail})
            </a>
          </p>
          {booking.guestNotes && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Notes:</span>{" "}
              {booking.guestNotes}
            </p>
          )}
          {booking.proposalMessage && (
            <div className="flex items-start gap-1.5 mt-2 p-2.5 bg-background rounded-md border text-sm">
              <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-muted-foreground italic">
                &ldquo;{booking.proposalMessage}&rdquo;
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={responding || showDeclineForm}
          >
            <Check className="w-4 h-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDeclineForm((v) => !v)}
            disabled={responding}
          >
            <X className="w-4 h-4" />
            Decline
            {showDeclineForm ? (
              <ChevronUp className="w-3 h-3 ml-0.5" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-0.5" />
            )}
          </Button>
        </div>
      </div>

      {showDeclineForm && (
        <div className="border-t border-amber-200 dark:border-amber-800 pt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`decline-reason-${booking.id}`}>
              Reason for declining (optional)
            </Label>
            <Textarea
              id={`decline-reason-${booking.id}`}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Let the guest know why this time doesn't work..."
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDecline}
              disabled={responding}
            >
              {responding ? "Declining..." : "Confirm decline"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowDeclineForm(false);
                setDeclineReason("");
              }}
              disabled={responding}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
