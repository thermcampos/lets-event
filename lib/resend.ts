import { formatInTimeZone } from "date-fns-tz";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_APIKEY);

const EMAIL_FROM = "Lets Event <no-reply@lets-event.online>";

interface BookingEmailParams {
  to: string;
  guestName: string;
  guestEmail: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  guestNotes?: string | null;
  meetLink?: string | null;
  timezone?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date: Date, timezone?: string): string {
  return formatInTimeZone(date, timezone || "UTC", "EEEE, MMMM d, yyyy");
}

function formatTime(date: Date, timezone?: string): string {
  return formatInTimeZone(date, timezone || "UTC", "h:mm a");
}

function formatTz(date: Date, timezone?: string): string {
  return formatInTimeZone(date, timezone || "UTC", "zzz");
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#71717a;font-size:13px;vertical-align:top;width:80px;padding-right:16px;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;color:#09090b;font-size:14px;vertical-align:top;">${value}</td>
  </tr>`;
}

function wrapEmail(accentColor: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:40px 20px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
          <tr>
            <td style="padding-bottom:20px;text-align:center;">
              <span style="font-size:20px;font-weight:700;color:#09090b;letter-spacing:-0.5px;">Event.me</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${accentColor};height:4px;font-size:1px;line-height:1px;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:28px 32px 32px;">
                    ${body}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">Event.me &middot; Your scheduling made simple</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendBookingCreatedEmail(params: BookingEmailParams) {
  const {
    to,
    guestName,
    guestEmail,
    eventTitle,
    startTime,
    endTime,
    guestNotes,
    meetLink,
    timezone,
  } = params;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const safeGuestEmail = escapeHtml(guestEmail);
  const safeNotes = guestNotes ? escapeHtml(guestNotes) : null;
  const safeMeetLink = meetLink ? escapeHtml(meetLink) : null;

  const dateStr = escapeHtml(formatDate(startTime, timezone));
  const startStr = escapeHtml(formatTime(startTime, timezone));
  const endStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">New Booking Scheduled</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">You have a new booking confirmed.</p>

    <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${startStr} &ndash; ${endStr} (${tzStr})</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Guest", safeGuestName)}
      ${detailRow("Email", `<a href="mailto:${safeGuestEmail}" style="color:#4f46e5;text-decoration:none;">${safeGuestEmail}</a>`)}
      ${safeNotes ? detailRow("Notes", `<span style="white-space:pre-wrap;">${safeNotes}</span>`) : ""}
      ${safeMeetLink ? detailRow("Meet link", `<a href="${safeMeetLink}" style="color:#4f46e5;text-decoration:none;">${safeMeetLink}</a>`) : ""}
    </table>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `New Booking: ${eventTitle} with ${guestName}`,
    html: wrapEmail("#4f46e5", body),
  });
}

export async function sendBookingCancelledEmail(params: BookingEmailParams) {
  const {
    to,
    guestName,
    guestEmail,
    eventTitle,
    startTime,
    endTime,
    timezone,
  } = params;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const safeGuestEmail = escapeHtml(guestEmail);

  const dateStr = escapeHtml(formatDate(startTime, timezone));
  const startStr = escapeHtml(formatTime(startTime, timezone));
  const endStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">Booking Cancelled</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">A booking has been cancelled.</p>

    <div style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin-bottom:24px;border:1px solid #fecaca;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${startStr} &ndash; ${endStr} (${tzStr})</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Guest", safeGuestName)}
      ${detailRow("Email", `<a href="mailto:${safeGuestEmail}" style="color:#4f46e5;text-decoration:none;">${safeGuestEmail}</a>`)}
    </table>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Booking Cancelled: ${eventTitle} with ${guestName}`,
    html: wrapEmail("#ef4444", body),
  });
}

export async function sendBookingRescheduledEmail(
  params: BookingEmailParams & {
    previousStartTime: Date;
    previousEndTime: Date;
  },
) {
  const {
    to,
    guestName,
    guestEmail,
    eventTitle,
    startTime,
    endTime,
    previousStartTime,
    previousEndTime,
    meetLink,
    timezone,
  } = params;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const safeGuestEmail = escapeHtml(guestEmail);
  const safeMeetLink = meetLink ? escapeHtml(meetLink) : null;

  const prevDateStr = escapeHtml(formatDate(previousStartTime, timezone));
  const prevStartStr = escapeHtml(formatTime(previousStartTime, timezone));
  const prevEndStr = escapeHtml(formatTime(previousEndTime, timezone));

  const newDateStr = escapeHtml(formatDate(startTime, timezone));
  const newStartStr = escapeHtml(formatTime(startTime, timezone));
  const newEndStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">Booking Rescheduled</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">A booking has been moved to a new time.</p>

    <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a1a1aa;">Previous time</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;text-decoration:line-through;">${prevDateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;text-decoration:line-through;">${prevStartStr} &ndash; ${prevEndStr}</p>
    </div>

    <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a1a1aa;">New time</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin-bottom:24px;border:1px solid #bbf7d0;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">${newDateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${newStartStr} &ndash; ${newEndStr} (${tzStr})</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Guest", safeGuestName)}
      ${detailRow("Email", `<a href="mailto:${safeGuestEmail}" style="color:#4f46e5;text-decoration:none;">${safeGuestEmail}</a>`)}
      ${safeMeetLink ? detailRow("Meet link", `<a href="${safeMeetLink}" style="color:#4f46e5;text-decoration:none;">${safeMeetLink}</a>`) : ""}
    </table>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Booking Rescheduled: ${eventTitle} with ${guestName}`,
    html: wrapEmail("#f59e0b", body),
  });
}

export async function sendProposalReceivedEmail(params: {
  to: string;
  guestName: string;
  guestEmail: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  proposalMessage?: string | null;
  timezone?: string;
}) {
  const {
    to,
    guestName,
    guestEmail,
    eventTitle,
    startTime,
    endTime,
    proposalMessage,
    timezone,
  } = params;

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const approveUrl = `${baseUrl}/dashboard/bookings`;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const safeGuestEmail = escapeHtml(guestEmail);
  const dateStr = escapeHtml(formatDate(startTime, timezone));
  const startStr = escapeHtml(formatTime(startTime, timezone));
  const endStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">New Booking Proposal</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">${safeGuestName} has proposed a custom date/time for <strong>${safeEventTitle}</strong>.</p>

    <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">Proposed: ${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${startStr} &ndash; ${endStr} (${tzStr})</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Guest", safeGuestName)}
      ${detailRow("Email", `<a href="mailto:${safeGuestEmail}" style="color:#4f46e5;text-decoration:none;">${safeGuestEmail}</a>`)}
      ${proposalMessage ? detailRow("Message", escapeHtml(proposalMessage)) : ""}
    </table>

    <div style="margin-top:24px;text-align:center;">
      <a href="${approveUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:6px;text-decoration:none;">Review Proposal</a>
    </div>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `New booking proposal: ${eventTitle} with ${guestName}`,
    html: wrapEmail("#4f46e5", body),
  });
}

export async function sendProposalApprovedEmail(params: {
  to: string;
  guestName: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  meetLink?: string | null;
  timezone?: string;
}) {
  const { to, guestName, eventTitle, startTime, endTime, meetLink, timezone } =
    params;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const dateStr = escapeHtml(formatDate(startTime, timezone));
  const startStr = escapeHtml(formatTime(startTime, timezone));
  const endStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">Proposal Approved!</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Your booking proposal for <strong>${safeEventTitle}</strong> has been approved.</p>

    <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${startStr} &ndash; ${endStr} (${tzStr})</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Guest", safeGuestName)}
      ${meetLink ? detailRow("Meeting Link", `<a href="${escapeHtml(meetLink)}" style="color:#4f46e5;text-decoration:none;">Join Meeting</a>`) : ""}
    </table>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Your booking proposal was approved: ${eventTitle}`,
    html: wrapEmail("#10b981", body),
  });
}

export async function sendProposalDeclinedEmail(params: {
  to: string;
  guestName: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  reason?: string | null;
  timezone?: string;
}) {
  const { to, guestName, eventTitle, startTime, endTime, reason, timezone } =
    params;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const dateStr = escapeHtml(formatDate(startTime, timezone));
  const startStr = escapeHtml(formatTime(startTime, timezone));
  const endStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">Proposal Declined</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Your booking proposal for <strong>${safeEventTitle}</strong> was not approved.</p>

    <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${startStr} &ndash; ${endStr} (${tzStr})</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Guest", safeGuestName)}
      ${reason ? detailRow("Reason", escapeHtml(reason)) : ""}
    </table>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Your booking proposal was declined: ${eventTitle}`,
    html: wrapEmail("#ef4444", body),
  });
}

export async function sendBookingCompletedGuestEmail(params: {
  to: string;
  guestName: string;
  eventTitle: string;
  startTime: Date;
  endTime: Date;
  timezone?: string;
}) {
  const { to, guestName, eventTitle, startTime, endTime, timezone } = params;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const dateStr = escapeHtml(formatDate(startTime, timezone));
  const startStr = escapeHtml(formatTime(startTime, timezone));
  const endStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">Meeting Completed</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Hi ${safeGuestName}, your meeting has been marked as completed.</p>

    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin-bottom:24px;border:1px solid #bbf7d0;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${startStr} &ndash; ${endStr} (${tzStr})</p>
    </div>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Meeting Completed: ${eventTitle}`,
    html: wrapEmail("#10b981", body),
  });
}

export async function sendBookingStatusChangedEmail(
  params: BookingEmailParams & { status: string },
) {
  const {
    to,
    guestName,
    guestEmail,
    eventTitle,
    startTime,
    endTime,
    status,
    timezone,
  } = params;

  const safeEventTitle = escapeHtml(eventTitle);
  const safeGuestName = escapeHtml(guestName);
  const safeGuestEmail = escapeHtml(guestEmail);
  const safeStatus = escapeHtml(status);
  const capitalizedStatus =
    safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1);

  const accentMap: Record<string, string> = {
    confirmed: "#4f46e5",
    cancelled: "#ef4444",
    completed: "#10b981",
  };
  const accentColor = accentMap[status] || "#71717a";

  const dateStr = escapeHtml(formatDate(startTime, timezone));
  const startStr = escapeHtml(formatTime(startTime, timezone));
  const endStr = escapeHtml(formatTime(endTime, timezone));
  const tzStr = escapeHtml(formatTz(startTime, timezone));

  const body = `
    <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#09090b;">Booking ${capitalizedStatus}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Booking status updated to <strong>${safeStatus}</strong>.</p>

    <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#09090b;">${safeEventTitle}</p>
      <p style="margin:0 0 2px;font-size:13px;color:#71717a;">${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#71717a;">${startStr} &ndash; ${endStr} (${tzStr})</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow("Guest", safeGuestName)}
      ${detailRow("Email", `<a href="mailto:${safeGuestEmail}" style="color:#4f46e5;text-decoration:none;">${safeGuestEmail}</a>`)}
    </table>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}: ${eventTitle} with ${guestName}`,
    html: wrapEmail(accentColor, body),
  });
}
