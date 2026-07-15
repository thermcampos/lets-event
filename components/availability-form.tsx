"use client";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

interface AvailabilityFormProps {
  action: (formData: FormData) => void;
}

export function AvailabilityForm({ action }: AvailabilityFormProps) {
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="dayOfWeek">Day of Week</Label>
        <select
          id="dayOfWeek"
          name="dayOfWeek"
          required
          className="w-full px-3 py-2 border rounded-md"
        >
          {DAYS_OF_WEEK.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="startTime">Start Time</Label>
        <Input
          id="startTime"
          name="startTime"
          type="time"
          required
          placeholder="09:00"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="endTime">End Time</Label>
        <Input
          id="endTime"
          name="endTime"
          type="time"
          required
          placeholder="17:00"
        />
      </div>

      <SubmitButton type="submit" className="w-full" loadingText="Adding...">
        Add Availability
      </SubmitButton>
    </form>
  );
}
