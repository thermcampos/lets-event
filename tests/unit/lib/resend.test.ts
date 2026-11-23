import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ id: "test-email-id" }),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import {
  sendBookingCancelledEmail,
  sendBookingCompletedGuestEmail,
  sendBookingCreatedEmail,
  sendBookingRescheduledEmail,
  sendBookingStatusChangedEmail,
  sendProposalApprovedEmail,
  sendProposalDeclinedEmail,
  sendProposalReceivedEmail,
} from "@/lib/resend";

describe("Resend Email Notifications", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  const baseParams = {
    to: "user@example.com",
    guestName: "John Doe",
    guestEmail: "john@example.com",
    eventTitle: "30 Minute Meeting",
    startTime: new Date("2026-03-01T10:00:00Z"),
    endTime: new Date("2026-03-01T10:30:00Z"),
  };

  describe("sendBookingCreatedEmail", () => {
    it("should send email with correct parameters", async () => {
      await sendBookingCreatedEmail(baseParams);

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("user@example.com");
      expect(call.subject).toContain("New Booking");
      expect(call.subject).toContain("30 Minute Meeting");
      expect(call.subject).toContain("John Doe");
      expect(call.html).toContain("John Doe");
      expect(call.html).toContain("john@example.com");
    });

    it("should include guest notes when provided", async () => {
      await sendBookingCreatedEmail({
        ...baseParams,
        guestNotes: "Please prepare slides",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("Please prepare slides");
    });

    it("should include meet link when provided", async () => {
      await sendBookingCreatedEmail({
        ...baseParams,
        meetLink: "https://meet.google.com/abc-def-ghi",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("https://meet.google.com/abc-def-ghi");
    });
  });

  describe("sendBookingCancelledEmail", () => {
    it("should send cancellation email with correct parameters", async () => {
      await sendBookingCancelledEmail(baseParams);

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("user@example.com");
      expect(call.subject).toContain("Cancelled");
      expect(call.subject).toContain("30 Minute Meeting");
      expect(call.html).toContain("Booking Cancelled");
    });
  });

  describe("sendBookingRescheduledEmail", () => {
    it("should send rescheduled email with old and new times", async () => {
      await sendBookingRescheduledEmail({
        ...baseParams,
        startTime: new Date("2026-03-02T14:00:00Z"),
        endTime: new Date("2026-03-02T14:30:00Z"),
        previousStartTime: new Date("2026-03-01T10:00:00Z"),
        previousEndTime: new Date("2026-03-01T10:30:00Z"),
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("user@example.com");
      expect(call.subject).toContain("Rescheduled");
      expect(call.html).toContain("Previous time");
      expect(call.html).toContain("New time");
    });
  });

  describe("sendBookingStatusChangedEmail", () => {
    it("should send status change email with correct status", async () => {
      await sendBookingStatusChangedEmail({
        ...baseParams,
        status: "confirmed",
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("user@example.com");
      expect(call.subject).toContain("Confirmed");
      expect(call.html).toContain("confirmed");
    });
  });

  const guestParams = {
    to: "john@example.com",
    guestName: "John Doe",
    eventTitle: "30 Minute Meeting",
    startTime: baseParams.startTime,
    endTime: baseParams.endTime,
  };

  describe("sendProposalReceivedEmail", () => {
    it("should notify the host with proposal details and a review link", async () => {
      vi.stubEnv("NEXTAUTH_URL", "https://app.test");
      try {
        await sendProposalReceivedEmail({
          ...baseParams,
          proposalMessage: "Can we do later?",
        });
      } finally {
        vi.unstubAllEnvs();
      }

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("user@example.com");
      expect(call.subject).toBe(
        "New booking proposal: 30 Minute Meeting with John Doe",
      );
      expect(call.html).toContain("New Booking Proposal");
      expect(call.html).toContain("john@example.com");
      expect(call.html).toContain("Can we do later?");
      expect(call.html).toContain("https://app.test/dashboard/bookings");
    });

    it("should escape html in the user-provided message", async () => {
      await sendProposalReceivedEmail({
        ...baseParams,
        proposalMessage: "<script>alert(1)</script>",
      });
      const call = mockSend.mock.calls[0][0];
      expect(call.html).not.toContain("<script>alert(1)</script>");
      expect(call.html).toContain("&lt;script&gt;");
    });
  });

  describe("sendProposalApprovedEmail", () => {
    it("should send approval email with meet link", async () => {
      await sendProposalApprovedEmail({
        ...guestParams,
        meetLink: "https://meet.google.com/abc-def-ghi",
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("john@example.com");
      expect(call.subject).toBe(
        "Your booking proposal was approved: 30 Minute Meeting",
      );
      expect(call.html).toContain("Proposal Approved!");
      expect(call.html).toContain("https://meet.google.com/abc-def-ghi");
    });

    it("should omit the meeting link when none is given", async () => {
      await sendProposalApprovedEmail(guestParams);
      expect(mockSend.mock.calls[0][0].html).not.toContain("Join Meeting");
    });
  });

  describe("sendProposalDeclinedEmail", () => {
    it("should send decline email with reason", async () => {
      await sendProposalDeclinedEmail({
        ...guestParams,
        reason: "Out of office",
      });

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("john@example.com");
      expect(call.subject).toBe(
        "Your booking proposal was declined: 30 Minute Meeting",
      );
      expect(call.html).toContain("Proposal Declined");
      expect(call.html).toContain("Out of office");
    });

    it("should omit the reason row when none is given", async () => {
      await sendProposalDeclinedEmail(guestParams);
      expect(mockSend.mock.calls[0][0].html).not.toContain("Reason");
    });
  });

  describe("sendBookingCompletedGuestEmail", () => {
    it("should send completion email without attachment by default", async () => {
      await sendBookingCompletedGuestEmail(guestParams);

      expect(mockSend).toHaveBeenCalledOnce();
      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe("Let's Event <no-reply@lets-event.online>");
      expect(call.to).toBe("john@example.com");
      expect(call.subject).toBe("Meeting Completed: 30 Minute Meeting");
      expect(call.html).toContain("Hi John Doe");
      expect(call.attachments).toBeUndefined();
    });

    it("should pass the attachment through", async () => {
      const attachment = { filename: "notes.txt", content: "abc" };
      await sendBookingCompletedGuestEmail({ ...guestParams, attachment });
      expect(mockSend.mock.calls[0][0].attachments).toEqual([attachment]);
    });
  });
});
