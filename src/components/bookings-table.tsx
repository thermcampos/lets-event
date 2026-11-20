"use client";

import type { Booking, EventType } from "@prisma/client";
import { format } from "date-fns";
import { Check, Clock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BookingsTableProps {
  bookings: (Booking & { eventType: EventType })[];
  emptyMessage?: string;
}

export function BookingsTable({
  bookings: initialBookings,
  emptyMessage = "No bookings yet",
}: BookingsTableProps) {
  const router = useRouter();
  const [bookings, setBookings] = useState(initialBookings);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleCancel = async (bookingId: string) => {
    setCancelling(bookingId);

    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!response.ok) {
        throw new Error("Failed to cancel booking");
      }

      setBookings(
        bookings.map((b) =>
          b.id === bookingId ? { ...b, status: "cancelled" } : b,
        ),
      );

      toast.success("Booking cancelled successfully");
    } catch (_error) {
      toast.error("Failed to cancel booking");
    } finally {
      setCancelling(null);
    }
  };

  const openCompleteDialog = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setSelectedFile(null);
    setCompleteDialogOpen(true);
  };

  const closeCompleteDialog = () => {
    setCompleteDialogOpen(false);
    setSelectedBookingId(null);
    setSelectedFile(null);
  };

  const handleComplete = async () => {
    if (!selectedBookingId) {
      return;
    }

    setCompleting(selectedBookingId);

    try {
      const formData = new FormData();
      formData.append("status", "completed");
      if (selectedFile) {
        formData.append("pdf", selectedFile);
      }

      const response = await fetch(`/api/bookings/${selectedBookingId}`, {
        method: "PATCH",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to complete booking");
      }

      setBookings(bookings.filter((b) => b.id !== selectedBookingId));
      router.refresh();

      toast.success("Meeting marked as completed");
      closeCompleteDialog();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to mark meeting as completed";
      toast.error(message);
    } finally {
      setCompleting(null);
    }
  };

  if (bookings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <div
          key={booking.id}
          className="flex flex-col sm:flex-row items-start justify-between p-4 border rounded-lg hover:bg-accent gap-4"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{booking.eventType.title}</h3>
              <Badge
                variant={
                  booking.status === "confirmed"
                    ? "default"
                    : booking.status === "cancelled" ||
                        booking.status === "declined"
                      ? "destructive"
                      : "secondary"
                }
                className={
                  booking.status === "completed"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-transparent"
                    : undefined
                }
              >
                {booking.status}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              {format(new Date(booking.startTime), "PPP 'at' p")}
            </p>

            <div className="text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Guest:</span>
                {booking.guestName} ({booking.guestEmail})
              </p>
              {booking.guestNotes && (
                <p className="text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">Notes:</span>{" "}
                  {booking.guestNotes}
                </p>
              )}
            </div>
          </div>

          {booking.status === "confirmed" && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {new Date(booking.endTime) < new Date() && (
                <Button
                  variant="outline"
                  onClick={() => openCompleteDialog(booking.id)}
                  disabled={completing === booking.id}
                  className="flex-1 sm:flex-none"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  <span className="ml-1">
                    {completing === booking.id ? "Completing..." : "Complete"}
                  </span>
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => router.push(`/booking/reschedule/${booking.id}`)}
                className="flex-1 sm:flex-none"
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span className="ml-1 hidden sm:inline">Reschedule</span>
                <span className="ml-1 sm:hidden">Reschedule</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleCancel(booking.id)}
                disabled={cancelling === booking.id}
                className="flex-1 sm:flex-none"
              >
                <X className="w-4 h-4 shrink-0" />
                <span className="ml-1">
                  {cancelling === booking.id ? "Cancelling..." : "Cancel"}
                </span>
              </Button>
            </div>
          )}
        </div>
      ))}

      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark meeting as completed</DialogTitle>
            <DialogDescription>
              The invitee will receive a completion email. You can optionally
              attach a PDF (max 5 MB).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="completion-pdf">Attachment (optional)</Label>
              <Input
                id="completion-pdf"
                type="file"
                accept="application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Only PDF files up to 5 MB are allowed.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={closeCompleteDialog}
              disabled={completing === selectedBookingId}
            >
              Cancel
            </Button>
            <Button
              onClick={handleComplete}
              disabled={completing === selectedBookingId}
            >
              {completing === selectedBookingId
                ? "Completing..."
                : "Mark as completed"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
