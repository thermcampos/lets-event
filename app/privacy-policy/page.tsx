import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicyPage() {
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
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <p className="text-muted-foreground text-sm">
              Last updated: June 24, 2026
            </p>
          </CardHeader>
          <CardContent className="prose max-w-none space-y-6">
            <section>
              <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
              <p className="text-muted-foreground">
                Event.me is a scheduling tool that lets you share your
                availability and accept bookings. We collect only what is
                strictly necessary to provide this service. We do not run
                analytics, sell data, or track your behavior.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                2. Data We Store
              </h2>
              <p className="text-muted-foreground mb-2">
                When you create an account, we store:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Your name and email address</li>
                <li>
                  A hashed (non-reversible) version of your password — we never
                  store your password in plain text
                </li>
                <li>Your profile picture, if you upload one</li>
                <li>
                  Your availability settings, event types, and booking records
                </li>
                <li>
                  Your Google Calendar OAuth tokens, if you connect your Google
                  account
                </li>
              </ul>
              <p className="text-muted-foreground mt-2">
                We do not collect your location, device fingerprint, browsing
                history, or any data beyond what is listed above.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                3. How We Use Your Data
              </h2>
              <p className="text-muted-foreground mb-2">
                Your data is used exclusively to operate the service:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Authenticate your account</li>
                <li>Display your availability to people booking with you</li>
                <li>Create and manage bookings</li>
                <li>
                  Sync events with your Google Calendar when you have enabled
                  that integration
                </li>
                <li>
                  Send transactional emails (booking confirmations, reminders,
                  and cancellations)
                </li>
              </ul>
              <p className="text-muted-foreground mt-2">
                We do not use your data for marketing, profiling, or any purpose
                beyond what is described here.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                4. Third-Party Services
              </h2>
              <p className="text-muted-foreground mb-3">
                Event.me is built on third-party infrastructure. Each provider
                has its own privacy policy that applies to the data they handle.
              </p>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-foreground">Vercel</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Event.me is hosted on{" "}
                    <a
                      href="https://vercel.com"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Vercel
                    </a>
                    . As our hosting provider, Vercel may collect infrastructure
                    telemetry such as IP addresses, request timestamps, and
                    performance metrics in order to operate their platform. Your
                    profile pictures are stored in Vercel Blob. Refer to{" "}
                    <a
                      href="https://vercel.com/legal/privacy-policy"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Vercel's Privacy Policy
                    </a>{" "}
                    for details.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">Google</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    When you sign in with Google, we request your{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      userinfo.email
                    </code>{" "}
                    and{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      userinfo.profile
                    </code>{" "}
                    scopes to identify your account and display your name and
                    profile picture. If you connect your Google Calendar, we
                    also request OAuth access to read and write calendar
                    events on your behalf (specifically, the{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      calendar.events
                    </code>{" "}
                    scope). We store the resulting OAuth tokens in our database
                    solely to perform calendar operations you initiate within
                    Event.me.
                  </p>
                  <p className="text-muted-foreground text-sm mt-2">
                    <strong>
                      We do not share, sell, transfer, or disclose your Google
                      user data — including your Google Calendar events, profile
                      information, or OAuth tokens — to any third party.
                    </strong>{" "}
                    Google user data is used exclusively to operate the calendar
                    sync feature. It is never used for advertising, profiling,
                    or any purpose beyond what you explicitly request.
                  </p>
                  <p className="text-muted-foreground text-sm mt-2">
                    You can revoke this access at any time from your{" "}
                    <a
                      href="https://myaccount.google.com/permissions"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google account permissions
                    </a>{" "}
                    or from your Event.me account settings. Refer to{" "}
                    <a
                      href="https://policies.google.com/privacy"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google's Privacy Policy
                    </a>
                    .
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">Resend</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    Transactional emails (booking confirmations, reminders, and
                    cancellations) are sent through{" "}
                    <a
                      href="https://resend.com"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Resend
                    </a>
                    . Your email address and booking details are transmitted to
                    Resend for delivery. Refer to{" "}
                    <a
                      href="https://resend.com/legal/privacy-policy"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Resend's Privacy Policy
                    </a>
                    .
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
              <p className="text-muted-foreground">
                Your data is retained for as long as your account exists. When
                you delete your account, your personal data, event types,
                availability settings, and booking records are permanently
                removed from our database. Profile pictures stored in Vercel
                Blob are also deleted at that time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
              <p className="text-muted-foreground mb-2">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>
                  <strong>Access</strong> — request a copy of the personal data
                  we hold about you
                </li>
                <li>
                  <strong>Correction</strong> — update your name, email, or
                  profile picture at any time from account settings
                </li>
                <li>
                  <strong>Deletion</strong> — delete your account, which
                  permanently removes all your data
                </li>
                <li>
                  <strong>Portability</strong> — request an export of your data
                </li>
                <li>
                  <strong>Revoke Google access</strong> — disconnect your Google
                  Calendar at any time from account settings
                </li>
              </ul>
              <p className="text-muted-foreground mt-2">
                To exercise any of these rights, contact us at the address
                below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">7. Security</h2>
              <p className="text-muted-foreground">
                Passwords are hashed using bcrypt before storage. All data in
                transit is encrypted via HTTPS. We do not store payment
                information. While we take reasonable precautions, no system is
                completely immune to attack and we cannot guarantee absolute
                security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">8. Cookies</h2>
              <p className="text-muted-foreground">
                Event.me uses a single session cookie to keep you authenticated.
                No third-party tracking cookies, advertising pixels, or
                analytics scripts are loaded.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                9. Children's Privacy
              </h2>
              <p className="text-muted-foreground">
                Event.me is not directed to individuals under 13. We do not
                knowingly collect data from children. If you believe a child has
                created an account, contact us and we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">
                10. Changes to This Policy
              </h2>
              <p className="text-muted-foreground">
                If we make material changes to this policy, we will update the
                date at the top of this page and, where appropriate, notify
                registered users by email.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">11. Contact</h2>
              <p className="text-muted-foreground">
                Questions about this policy or requests to exercise your rights
                can be sent to{" "}
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
