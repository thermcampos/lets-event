# AGENTS.md - Let's Event Developer Guide

This guide documents essential context for AI agents working on the Let's Event codebase.

## Project Overview

Let's Event is a Calendly-like scheduling application built with Next.js 16, featuring:
- User authentication via NextAuth v5 (credentials + Google OAuth)
- Availability management per user
- Event type creation with booking constraints
- Public booking pages
- Google Calendar integration with auto event creation
- Email notifications via Resend

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | PostgreSQL 16 + Prisma 7 |
| Auth | NextAuth v5 (Credentials + Google OAuth) |
| UI | Tailwind CSS 4 + shadcn/ui |
| Testing | Playwright (E2E) + Vitest (Unit) |
| Linting | Biome 2.4.4 |
| Email | Resend |

## Essential Commands

```bash
# Development
npm run dev              # Start dev server (Turbopack)

# Build & Deploy
npm run build            # Production build
npm run vercel-build     # Prisma migrate + generate + build
npm run postinstall      # Prisma generate (runs automatically)

# Database
npm run db:push          # Push schema changes (dev)
npm run db:migrate       # Run migrations
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database

# Code Quality
npm run lint             # Check with Biome
npm run format           # Format with Biome

# Testing
npm test                 # E2E tests (Playwright)
npm run test:ui          # Playwright UI mode
npm run test:headed      # Playwright headed mode
npm run test:debug       # Playwright debug mode
npm run test:codegen     # Playwright codegen for tests

# Docker
docker-compose up -d     # Start PostgreSQL locally
```

## Code Organization

```
app/
  ├── api/               # API routes (NextAuth, slots, bookings)
  ├── dashboard/         # Protected dashboard pages
  │   ├── availability/  # Weekly availability management
  │   ├── event-types/   # CRUD for event types
  │   ├── bookings/      # Manage existing bookings
  │   ├── settings/      # User settings, Google Calendar connect
  │   └── integrations/    # Integration management
  ├── book/[username]/   # Public booking pages
  ├── booking/           # Booking flow (cancel, reschedule, success)
  ├── login/             # Auth pages
  └── register/

components/
  ├── ui/                # shadcn/ui components (Button, Card, etc.)
  └── *.tsx              # App components (booking-form, etc.)

lib/
  ├── prisma.ts          # Server-side Prisma client import (re-exports from prisma.server)
  ├── prisma.server.ts   # Prisma client with pg adapter (DO NOT import in middleware/client)
  ├── slots.ts           # Slot calculation logic
  ├── google-calendar.ts # Google Calendar API integration
  ├── resend.ts          # Email sending
  └── utils.ts           # cn() helper for Tailwind

prisma/
  ├── schema.prisma      # Database schema
  └── migrations/        # Database migrations

tests/                   # Playwright E2E tests
__tests__/               # Vitest unit tests
```

## Critical Patterns & Gotchas

### Prisma Client Usage

**ALWAYS** use the correct import depending on context:

```typescript
// Server components, API routes, server actions
import { prisma } from "@/lib/prisma.server";

// Do NOT import prisma in:
// - middleware.ts (use auth from @/auth instead)
// - Client components
// - Edge runtime
```

The `lib/prisma.server.ts` uses `pg` Pool adapter which requires Node.js runtime. Middleware uses edge runtime.

### Google Calendar Integration

Google OAuth requires special scope for Calendar access:
```typescript
// auth.ts - Note the extended scope
authorization: {
  params: {
    scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
  },
}
```

When Google Calendar is connected, bookings automatically create calendar events with Google Meet links.

### Available Slots Algorithm

Slot calculation happens in `lib/slots.ts`:
- Takes user availability (day of week + time ranges)
- Filters out existing bookings
- Respects constraints (min notice, max notice, max bookings/week)
- Returns available TimeSlot objects

### Booking Constraints System

Each EventType has configurable constraints:
- `minimumNoticeHours`: Hours before booking that can be made (default: 24)
- `maximumNoticeDays`: Days in advance booking can be made (default: 14)
- `maxBookingsPerWeek`: Maximum bookings per week for this event type (null = unlimited)

### Username-Based Public URLs

Public booking uses `username` + `slug` pattern:
- `/book/:username` - Lists user's event types
- `/book/:username/:slug` - Specific event type booking page

Username must be unique (see User model in schema.prisma).

### Slot Availability API

GET `/api/slots?eventTypeId=X&date=YYYY-MM-DD` returns available slots for a date.

### Testing Patterns

**E2E Tests (Playwright):**
- Tests in `tests/` directory
- Use `generateTestUser()` for unique test data to avoid conflicts
- Tests run against real database (PostgreSQL in CI)
- Tests cover end-to-end flows: auth, availability, event types, booking, constraints

**Unit Tests (Vitest):**
- Tests in `__tests__/` directory
- Uses `happy-dom` environment
- Setup in `vitest.setup.ts` imports jest-dom matchers

### Booking Status Flow

```
confirmed -> cancelled (via cancel API)
confirmed -> rescheduled (new booking created, old cancelled)
```

Cancelled bookings are excluded from slot availability calculations.

### Middleware Auth Flow

```typescript
// middleware.ts
- Dashboard routes: redirect to /login if not authenticated
- Auth routes (/login, /register): redirect to /dashboard if authenticated
- Uses NextAuth v5 with JWT strategy
```

### Date Handling

- All dates stored in UTC in database
- User timezone stored in `User.timezone` (default: "UTC")
- Slot calculations use date-fns with user's timezone
- API accepts dates as ISO strings

## Environment Variables

Required for development:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:55002/eventme"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate with: openssl rand -base64 32"
AUTH_URL="http://localhost:3000"
AUTH_SECRET="generate with: openssl rand -base64 32"

# Optional: Google OAuth (for Calendar integration)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Optional: Resend (for email notifications)
RESEND_API_KEY=""
```

## Code Style

- **Formatter**: Biome 2.4.4
- **Indent**: 2 spaces
- **Quotes**: Double quotes
- **Semicolons**: Required
- **Pre-commit**: Husky runs Biome on staged files

## Database Schema Highlights

**Key Relationships:**
- User has many Availability, EventType, Booking
- EventType has many Booking
- Booking belongs to User and EventType

**Important Fields:**
- `User.username`: Unique, used for public URLs
- `User.timezone`: For slot calculations
- `EventType.slug`: Unique identifier for public booking
- `Booking.status`: "confirmed" | "cancelled" | "completed"
- `Booking.googleCalendarEventId`: Links to Google Calendar event

## CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`):
1. **Build job**: Install deps, generate Prisma client, push migrations, build
2. **Lint job**: Run Biome checks
3. **E2E job**: Run Playwright tests (requires PostgreSQL service)

## Common Tasks

**Add a new API route:**
1. Create file in `app/api/[name]/route.ts`
2. Export `GET|POST|PATCH|DELETE` handler functions
3. Use `prisma` from `@/lib/prisma.server` for database access

**Add a new dashboard page:**
1. Create directory in `app/dashboard/[page]/`
2. Add `page.tsx` (server component by default)
3. Add auth check at top: `await auth()` from `@/auth`

**Add a shadcn/ui component:**
```bash
npx shadcn add [component-name]
```

**Create a database migration:**
```bash
npx prisma migrate dev --name [description]
```

## Resources

- NextAuth v5 docs: https://authjs.dev/
- Prisma docs: https://www.prisma.io/docs
- shadcn/ui: https://ui.shadcn.com/
- Playwright: https://playwright.dev/
