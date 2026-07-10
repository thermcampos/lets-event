import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card shadow-sm border-b">
        <div className="container mx-auto px-4 py-6">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Event.me" width={40} height={40} />
            <span className="text-xl font-bold">Event.me</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Terms of Use</CardTitle>
            <p className="text-muted-foreground text-sm">
              Last updated: June 19, 2026
            </p>
          </CardHeader>
          <CardContent className="prose max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">
                1. Acceptance of Terms
              </h2>
              <p className="text-muted-foreground">
                By creating an account or using Event.me, you agree to these
                Terms of Use. If you do not agree, do not use the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                2. What Event.me Is
              </h2>
              <p className="text-muted-foreground">
                Event.me is a scheduling platform. It lets you define your
                availability, create bookable event types, and share a link so
                others can book time with you. Optionally, you can connect a
                Google Calendar to automatically check for conflicts and add
                confirmed bookings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">3. Your Account</h2>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>
                  You are responsible for keeping your credentials confidential.
                </li>
                <li>
                  You are responsible for all activity that occurs under your
                  account.
                </li>
                <li>
                  You must provide accurate information when registering and
                  keep it up to date.
                </li>
                <li>You must be at least 13 years old to use Event.me.</li>
                <li>
                  Notify us immediately if you believe your account has been
                  compromised.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
              <p className="text-muted-foreground mb-2">You agree not to:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Use the service for any unlawful purpose</li>
                <li>Attempt to access other users' accounts or data</li>
                <li>
                  Send spam, harass, or impersonate others through the booking
                  system
                </li>
                <li>
                  Reverse-engineer, scrape, or attempt to extract data from
                  Event.me
                </li>
                <li>
                  Interfere with or degrade the availability of the service
                </li>
                <li>
                  Use the service to distribute malware or malicious content
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                5. Bookings and Cancellations
              </h2>
              <p className="text-muted-foreground">
                Event.me facilitates scheduling between parties; it is not a
                party to any meeting or appointment. You are solely responsible
                for honoring, rescheduling, or cancelling your bookings.
                Event.me is not liable for missed appointments, scheduling
                conflicts, or disputes between bookers and hosts.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                6. Google Calendar Integration
              </h2>
              <p className="text-muted-foreground">
                Connecting your Google Calendar is optional. When connected,
                Event.me reads your calendar to check availability and writes
                new bookings as calendar events. You can disconnect at any time
                from your account settings. Your use of Google Calendar is also
                governed by{" "}
                <a
                  href="https://policies.google.com/terms"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google's Terms of Service
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                7. Intellectual Property
              </h2>
              <p className="text-muted-foreground">
                You own the content you create on Event.me (event names,
                descriptions, availability configurations). You grant Event.me a
                limited license to store and display this content solely to
                operate the service. The Event.me name, logo, and interface
                design are our property and may not be reproduced without
                permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                8. Service Availability
              </h2>
              <p className="text-muted-foreground">
                We aim for high availability but do not guarantee uninterrupted
                access. We may perform maintenance, apply updates, or experience
                outages. We will notify users of planned downtime when
                reasonably possible.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                9. Disclaimer of Warranties
              </h2>
              <p className="text-muted-foreground">
                Event.me is provided &quot;as is&quot; and &quot;as
                available&quot; without warranties of any kind, express or
                implied. We do not warrant that the service will be error-free,
                secure, or uninterrupted, or that it will meet your specific
                requirements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                10. Limitation of Liability
              </h2>
              <p className="text-muted-foreground">
                To the maximum extent permitted by applicable law, Event.me
                shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages arising from your use of, or
                inability to use, the service — including missed appointments,
                data loss, or unauthorized access to your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
              <p className="text-muted-foreground">
                You may delete your account at any time from your account
                settings. We may suspend or terminate accounts that violate
                these terms or that are otherwise harmful to the service or
                other users. Upon termination, your data is permanently deleted
                in accordance with our{" "}
                <Link href="/privacy-policy" className="underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                12. Changes to These Terms
              </h2>
              <p className="text-muted-foreground">
                We may update these terms from time to time. When we do, we will
                revise the date at the top of this page. For material changes,
                we will notify registered users by email. Continued use of the
                service after changes take effect constitutes acceptance of the
                revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">13. Governing Law</h2>
              <p className="text-muted-foreground">
                These terms are governed by applicable law. Any dispute arising
                from these terms or your use of Event.me will be subject to the
                exclusive jurisdiction of the competent courts.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">14. Contact</h2>
              <p className="text-muted-foreground">
                Questions about these terms can be sent to{" "}
                <a
                  href="mailto:ricardompcampos@gmail.com"
                  className="underline"
                >
                  ricardompcampos@gmail.com
                </a>
                .
              </p>
            </section>
          </CardContent>
        </Card>
      </main>

      <footer className="bg-card border-t mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-muted-foreground text-sm">
          <div className="space-x-4">
            <Link href="/privacy-policy" className="hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms-of-use" className="hover:underline">
              Terms of Use
            </Link>
          </div>
          <p className="mt-2">
            © {new Date().getFullYear()} Event.me. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
