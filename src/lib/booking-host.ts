/**
 * The only host (`User`) fields booking routes need to read (notification
 * email address and timezone). Never `include: { user: true }`: that loads the
 * whole row, including the password hash, and ends up in API responses.
 */
export const bookingHostSelect = { email: true, timezone: true } as const;
