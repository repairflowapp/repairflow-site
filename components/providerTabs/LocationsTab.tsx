"use client";

import ProviderLocationsTab from "@/components/providerTabs/ProviderLocationsTab";

export default function LocationsTab({
  providerUid,
}: {
  providerUid: string;
}) {
  return <ProviderLocationsTab providerUid={providerUid} />;
}
