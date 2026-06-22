"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function BookingLinkCard({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const bookingUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/book/${username}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="mb-6 bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800">
      <CardHeader>
        <CardTitle className="text-indigo-900 dark:text-indigo-100">Your Booking Link</CardTitle>
        <CardDescription className="text-indigo-700 dark:text-indigo-300">
          Share this link with people to allow them to book meetings with you
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 p-3 bg-white dark:bg-indigo-900 rounded-md border border-indigo-100 dark:border-indigo-700">
          <code className="text-sm flex-1 text-indigo-600 dark:text-indigo-300 font-mono break-all">
            {bookingUrl}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="text-indigo-700 dark:text-indigo-200 border-indigo-300 dark:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-800"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
