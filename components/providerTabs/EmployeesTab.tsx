// components/providerTabs/EmployeesTab.tsx
"use client";

import type { ProviderViewerRole } from "@/lib/roles";

type EmployeesTabProps = {
providerUid: string;
viewerRole: ProviderViewerRole;
};

export default function EmployeesTab({ providerUid, viewerRole }: EmployeesTabProps) {
return (
<div className="border rounded-xl p-4">
<div className="font-semibold">Employees</div>
<div className="text-sm opacity-70 mt-1">
providerUid: {providerUid} • role: {viewerRole}
</div>
</div>
);
}

