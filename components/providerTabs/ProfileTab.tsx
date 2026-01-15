"use client";

import ProviderProfileForm from "@/components/ProviderProfileForm";

type Props = {
  providerUid: string;
  viewerRole: "provider" | "dispatcher" | "manager" | "admin" | "unknown";
};

export default function ProfileTab({ providerUid, viewerRole }: Props) {
  const isOwner = viewerRole === "provider";

  if (!providerUid?.trim()) {
    return (
      <div className="text-sm text-red-600">
        Missing providerUid. Please sign out and back in.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Profile</h2>
        <p className="text-sm text-gray-600">
          Update your business profile. {!isOwner ? "(Read-only for your role)" : ""}
        </p>
      </div>

      <ProviderProfileForm providerUid={providerUid} readOnly={!isOwner} />
    </div>
  );
}
