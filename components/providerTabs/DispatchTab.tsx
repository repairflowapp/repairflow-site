"use client";

import DispatchCreateJobCard from "@/components/DispatchCreateJobCard";

export default function DispatchTab({ providerUid }: { providerUid: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Dispatch</h2>
        <p className="text-sm text-gray-600">
          Create internal “ghost” jobs and generate claim links for customers.
        </p>
      </div>

      <DispatchCreateJobCard providerUid={providerUid} />
    </div>
  );
}
