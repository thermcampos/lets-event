"use client";

import type { Booking, EventType } from "@prisma/client";
import { useState } from "react";
import { ProposedBookingCard } from "@/components/proposed-booking-card";

interface ProposalsSectionProps {
  proposals: (Booking & { eventType: EventType })[];
}

export function ProposalsSection({
  proposals: initial,
}: ProposalsSectionProps) {
  const [proposals, setProposals] = useState(initial);

  const handleResponded = (id: string) => {
    setProposals((prev) => prev.filter((p) => p.id !== id));
  };

  if (proposals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        All proposals have been reviewed
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => (
        <ProposedBookingCard
          key={proposal.id}
          booking={proposal}
          onResponded={handleResponded}
        />
      ))}
    </div>
  );
}
