// app/customer/providers/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
PROVIDER_CATEGORIES,
PROVIDER_CATEGORY_LABELS,
type ProviderCategory,
} from "@/lib/providerCategories";

type Provider = {
id: string;

businessName?: string;
phone?: string;

// you might store either of these arrays depending on older/newer code
categories?: string[];
services?: string[];

addressText?: string;
addressFormatted?: string;
serviceBaseLocationText?: string;

ratingAvg?: number;
ratingCount?: number;

baseLat?: number;
baseLng?: number;
};

function norm(s: any) {
return String(s ?? "")
.toLowerCase()
.replace(/\s+/g, " ")
.trim();
}

// ✅ Type guard: checks if a string is one of our allowed categories
function isProviderCategory(x: string): x is ProviderCategory {
return (PROVIDER_CATEGORIES as readonly string[]).includes(x);
}

// ✅ Return only valid ProviderCategory values (no random strings)
function getProviderCategoryKeys(p: Provider): ProviderCategory[] {
const a = Array.isArray(p.categories) ? p.categories : [];
const b = Array.isArray(p.services) ? p.services : [];

const merged = Array.from(new Set([...a, ...b].map(String)));

return merged.filter((k): k is ProviderCategory => isProviderCategory(k));
}

function getProviderAddress(p: Provider): string {
return p.addressText || p.addressFormatted || p.serviceBaseLocationText || "";
}

export default function CustomerProvidersDirectory() {
const router = useRouter();

// ✅ selectedCategory is typed now
const [selectedCategory, setSelectedCategory] = useState<ProviderCategory>(
PROVIDER_CATEGORIES[0]
);
const [locationSearch, setLocationSearch] = useState<string>("");

const [providers, setProviders] = useState<Provider[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
setLoading(true);
setError(null);

const unsub = onSnapshot(
collection(db, "businessProfiles"),
(snap) => {
const rows: Provider[] = snap.docs.map((d) => ({
id: d.id,
...(d.data() as any),
}));
setProviders(rows);
setLoading(false);
},
(e) => {
setError(e?.message ?? "Failed to load providers");
setLoading(false);
}
);

return () => unsub();
}, []);

const filtered = useMemo(() => {
const locQ = norm(locationSearch);

// 1) Filter by category key (matches either services[] OR categories[])
const byCategory = providers.filter((p) => {
const keys = getProviderCategoryKeys(p);
return keys.includes(selectedCategory);
});

// 2) Filter by location text (address contains search input)
const byLocation =
locQ.length === 0
? byCategory
: byCategory.filter((p) => {
const addr = norm(getProviderAddress(p));
return addr.includes(locQ);
});

// 3) Sort by rating
return [...byLocation].sort((a, b) => {
const ar = a.ratingAvg ?? 0;
const br = b.ratingAvg ?? 0;
if (br !== ar) return br - ar;
const ac = a.ratingCount ?? 0;
const bc = b.ratingCount ?? 0;
return bc - ac;
});
}, [providers, selectedCategory, locationSearch]);

return (
<div className="max-w-3xl mx-auto p-6">
<div className="flex items-center justify-between">
<div>
<h1 className="text-2xl font-semibold">Find Providers</h1>
<p className="text-sm opacity-70 mt-1">
Search by category and location, then call to schedule directly.
</p>
</div>

<button
className="text-sm underline opacity-80"
onClick={() => router.back()}
>
Back
</button>
</div>

{error && (
<div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-800">
<div className="font-semibold mb-1">Error</div>
<div>{error}</div>
</div>
)}

{/* Filters */}
<div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
<div>
<label className="block text-sm font-medium mb-2">Category</label>
<select
className="border rounded p-2 w-full"
value={selectedCategory}
onChange={(e) => setSelectedCategory(e.target.value as ProviderCategory)}
>
{PROVIDER_CATEGORIES.map((cat) => (
<option key={String(cat)} value={String(cat)}>
{PROVIDER_CATEGORY_LABELS[cat] ?? String(cat)}
</option>
))}
</select>
</div>

<div>
<label className="block text-sm font-medium mb-2">Location</label>
<input
className="border rounded p-2 w-full"
placeholder="City, state, ZIP, or address (ex: Philadelphia, PA)"
value={locationSearch}
onChange={(e) => setLocationSearch(e.target.value)}
/>
<div className="text-xs opacity-60 mt-1">
Tip: try city (Philadelphia), state (PA), or ZIP (19134).
</div>
</div>
</div>

{/* Results */}
<div className="mt-6 space-y-3">
{loading && <div className="opacity-70">Loading…</div>}

{!loading && filtered.length === 0 && (
<div className="opacity-70">
No providers found for this category
{locationSearch.trim() ? " in that location." : "."}
</div>
)}

{!loading &&
filtered.map((p) => {
const ratingAvg = (p.ratingAvg ?? 0).toFixed(1);
const ratingCount = p.ratingCount ?? 0;

const keys = getProviderCategoryKeys(p);
const categoriesLabel = keys
.map((c) => PROVIDER_CATEGORY_LABELS[c] ?? c)
.join(" • ");

const address = getProviderAddress(p);

return (
<div key={p.id} className="border rounded-xl p-4">
<div className="flex items-start justify-between gap-4">
<div>
<div className="font-semibold text-lg">
{p.businessName || "Provider"}
</div>

{categoriesLabel ? (
<div className="text-sm opacity-70 mt-1">
{categoriesLabel}
</div>
) : null}

<div className="text-sm mt-2">
⭐ {ratingAvg}{" "}
<span className="opacity-70">({ratingCount})</span>
</div>

{address ? (
<div className="text-sm opacity-80 mt-2">{address}</div>
) : (
<div className="text-sm opacity-60 mt-2">
No address on file
</div>
)}
</div>

<div className="text-right min-w-[120px]">
{p.phone ? (
<a
className="inline-block bg-black text-white rounded-lg px-4 py-2 font-medium hover:opacity-90"
href={`tel:${p.phone}`}
>
Call
</a>
) : (
<div className="opacity-60 text-sm">No phone</div>
)}
</div>
</div>
</div>
);
})}
</div>
</div>
);
}
