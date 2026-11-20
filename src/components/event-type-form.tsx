"use client";

import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EventTypeFormProps {
  action: (formData: FormData) => void;
  defaultValues?: {
    title?: string;
    slug?: string;
    description?: string | null;
    duration?: number;
    maxBookingsPerWeek?: number | null;
    minimumNoticeHours?: number;
    maximumNoticeDays?: number;
    active?: boolean;
  };
  showActive?: boolean;
}

export function EventTypeForm({
  action,
  defaultValues,
  showActive,
}: EventTypeFormProps) {
  return (
    <form action={action} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          name="title"
          placeholder="30 Minute Meeting"
          defaultValue={defaultValues?.title || ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">URL Slug *</Label>
        <Input
          id="slug"
          name="slug"
          placeholder="30min"
          defaultValue={defaultValues?.slug || ""}
          required
          pattern="[a-z0-9-]+"
          title="Only lowercase letters, numbers, and hyphens"
        />
        <p className="text-sm text-muted-foreground">
          This will be part of your booking URL
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="A brief 30-minute meeting to discuss..."
          rows={4}
          defaultValue={defaultValues?.description || ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="duration">Duration (minutes) *</Label>
        <Input
          id="duration"
          name="duration"
          type="number"
          placeholder="30"
          min="15"
          max="240"
          step="15"
          defaultValue={defaultValues?.duration || ""}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="maxBookingsPerWeek">Max Bookings Per Week</Label>
        <Input
          id="maxBookingsPerWeek"
          name="maxBookingsPerWeek"
          type="number"
          placeholder="Unlimited"
          min="1"
          defaultValue={defaultValues?.maxBookingsPerWeek ?? ""}
        />
        <p className="text-sm text-muted-foreground">
          Leave empty for unlimited bookings
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="minimumNoticeHours">Minimum Notice (hours) *</Label>
        <Input
          id="minimumNoticeHours"
          name="minimumNoticeHours"
          type="number"
          placeholder="24"
          defaultValue={defaultValues?.minimumNoticeHours ?? 24}
          min="1"
          required
        />
        <p className="text-sm text-muted-foreground">
          Minimum hours before event can start (e.g., 24 or 48)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="maximumNoticeDays">Maximum Notice (days) *</Label>
        <Input
          id="maximumNoticeDays"
          name="maximumNoticeDays"
          type="number"
          placeholder="14"
          defaultValue={defaultValues?.maximumNoticeDays ?? 14}
          min="1"
          max="365"
          required
        />
        <p className="text-sm text-muted-foreground">
          Maximum days in advance for booking (e.g., 7 or 14)
        </p>
      </div>

      {showActive && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="active"
            name="active"
            defaultChecked={defaultValues?.active ?? true}
            className="h-4 w-4"
          />
          <Label htmlFor="active">Active</Label>
        </div>
      )}

      <div className="flex gap-3">
        <SubmitButton type="submit" loadingText="Saving...">
          {defaultValues ? "Save Changes" : "Create Event Type"}
        </SubmitButton>
        <Button variant="outline" asChild>
          <Link href="/dashboard/event-types">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
