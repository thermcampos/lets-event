"use client";

import type { Booking, EventType } from "@prisma/client";
import { format } from "date-fns";
import { Check, Clock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  const handleComplete = async (bookingId: string) => {
    setCompleting(bookingId);

    try {
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });

      if (!response.ok) {
        throw new Error("Failed to complete booking");
      }

      setBookings(bookings.filter((b) => b.id !== bookingId));
      router.refresh();

      toast.success("Meeting marked as completed");
    } catch (_error) {
      toast.error("Failed to mark meeting as completed");
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
          className="flex items-start justify-between p-4 border rounded-lg hover:bg-accent"
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
                <span className="font-medium text-foreground">Guest:</span> {booking.guestName}{" "}
                ({booking.guestEmail})
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
            <div className="flex gap-2">
              {new Date(booking.endTime) < new Date() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleComplete(booking.id)}
                  disabled={completing === booking.id}
                >
                  <Check className="w-4 h-4 mr-1" />
                  {completing === booking.id ? "Completing..." : "Mark Complete"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/booking/reschedule/${booking.id}`)}
              >
                <Clock className="w-4 h-4 mr-1" />
                Reschedule
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCancel(booking.id)}
                disabled={cancelling === booking.id}
              >
                <X className="w-4 h-4 mr-1" />
                {cancelling === booking.id ? "Cancelling..." : "Cancel"}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
