"use client";

import { useMemo, useState } from "react";

type CategoryKey =
| "repair_shop"
| "parts_store"
| "towing_provider"
| "fleet"
| "customer";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
repair_shop: "Truck & Auto Repair Shop",
parts_store: "Truck & Auto Parts Store",
towing_provider: "Towing & Roadside Assistance Provider",
fleet: "Fleet",
customer: "Customer",
};

export default function HomePage() {
const [email, setEmail] = useState("");
const [firstName, setFirstName] = useState("");
const [categories, setCategories] = useState<Record<CategoryKey, boolean>>({
repair_shop: true,
parts_store: false,
towing_provider: false,
fleet: false,
customer: false,
});

const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
"idle"
);
const [msg, setMsg] = useState<string>("");

const selectedCategories = useMemo(() => {
return (Object.keys(categories) as CategoryKey[]).filter((k) => categories[k]);
}, [categories]);

function toggleCategory(key: CategoryKey) {
setCategories((prev) => ({ ...prev, [key]: !prev[key] }));
}

async function submit(e: React.FormEvent) {
e.preventDefault();
setStatus("loading");
setMsg("");

// Guard: at least one category
if (selectedCategories.length === 0) {
setStatus("error");
setMsg("Please select at least one category.");
return;
}

try {
const r = await fetch("/api/early-access", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
email,
firstName,
categories: selectedCategories, // <-- sends selected categories
}),
});

const data = await r.json().catch(() => ({}));

if (!r.ok) {
setStatus("error");
setMsg(data?.error || "Something went wrong. Try again.");
return;
}

setStatus("success");
setMsg("You’re on the list — we’ll email you early access updates.");
setEmail("");
setFirstName("");
// keep categories as-is (so user doesn't lose selection)
} catch (err: any) {
setStatus("error");
setMsg(err?.message || "Network error. Try again.");
}
}

return (
<main className="min-h-screen bg-white text-slate-900">
<header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
<div className="flex items-center gap-2">
<div className="h-9 w-9 rounded-xl bg-slate-900" />
<div className="leading-tight">
<div className="font-semibold">RepairFLOW</div>
<div className="text-xs text-slate-600">
RepairFlow Inc. (DBA RepairFLOW)
</div>
</div>
</div>

<a
href="#early-access"
className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
>
Get early access
</a>
</div>
</header>

{/* HERO */}
<section className="mx-auto max-w-6xl px-4 pb-10 pt-12">
<div className="grid gap-10 lg:grid-cols-2 lg:items-center">
<div>
<h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
The workflow system for modern repair businesses.
</h1>

<p className="mt-4 text-lg text-slate-700">
RepairFLOW helps repair shops, parts stores, and service providers manage
requests, communication, and updates in one place — built for speed, clarity,
and real-world operations.
</p>

<div className="mt-6 flex flex-wrap gap-3">
<a
href="#early-access"
className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
>
Join early access alerts
</a>
<a
href="#who"
className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
>
Who it’s for
</a>
</div>

<div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-3">
<Badge>Faster intake</Badge>
<Badge>Cleaner follow-ups</Badge>
<Badge>Less chaos</Badge>
<Badge>More visibility</Badge>
<Badge>Better handoffs</Badge>
<Badge>Early access updates</Badge>
</div>
</div>

{/* WAITLIST CARD */}
<div className="rounded-3xl border bg-slate-50 p-6 shadow-sm">
<div className="text-sm font-semibold text-slate-900">What you’ll get</div>
<ul className="mt-3 space-y-2 text-sm text-slate-700">
<li>• Early release announcements</li>
<li>• Feature drop alerts</li>
<li>• Beta invites when available</li>
<li>• Launch promos (if you want them)</li>
</ul>

<div className="mt-6 rounded-2xl bg-white p-4">
<div className="text-sm font-semibold">Join the waitlist</div>
<p className="mt-1 text-sm text-slate-600">
One email form. No spam. Unsubscribe anytime.
</p>

{/* Categories */}
<div className="mt-4">
<div className="text-sm font-semibold text-slate-900">
I’m signing up as:
</div>
<div className="mt-2 grid gap-2 sm:grid-cols-2">
{(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((k) => (
<label
key={k}
className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
>
<input
type="checkbox"
className="mt-1"
checked={categories[k]}
onChange={() => toggleCategory(k)}
/>
<span className="text-slate-800">{CATEGORY_LABELS[k]}</span>
</label>
))}
</div>
<div className="mt-2 text-xs text-slate-500">
Select one or multiple.
</div>
</div>

<form id="early-access" onSubmit={submit} className="mt-4 space-y-3">
<input
className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
placeholder="First name (optional)"
value={firstName}
onChange={(e) => setFirstName(e.target.value)}
/>
<input
className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
placeholder="Email address"
type="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
required
/>

<button
type="submit"
disabled={status === "loading"}
className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
>
{status === "loading" ? "Submitting..." : "Notify me"}
</button>

{msg && (
<div
className={`rounded-xl px-4 py-3 text-sm ${
status === "success"
? "bg-emerald-50 text-emerald-800"
: "bg-rose-50 text-rose-800"
}`}
>
{msg}
</div>
)}
</form>
</div>
</div>
</div>
</section>

{/* WHO ITS FOR */}
<section id="who" className="mx-auto max-w-6xl px-4 pb-14 pt-6">
<h2 className="text-2xl font-bold">Who it’s for</h2>
<p className="mt-2 max-w-2xl text-slate-700">
RepairFLOW is designed around the way repair and parts operations actually work.
</p>

<div className="mt-6 grid gap-4 md:grid-cols-2">
<Card
title="Truck & Auto Repair Shops"
items={[
"Centralize intake and job updates",
"Reduce missed calls and back-and-forth",
"Keep the team aligned on what’s next",
]}
/>

<Card
title="Truck & Auto Parts Stores"
items={[
"Streamline request handling",
"Keep customers updated faster",
"Reduce miscommunication on parts status",
]}
/>

<Card
title="Towing & Roadside Assistance Providers"
items={[
"Capture new service requests cleanly",
"Reduce phone-tag with better job details",
"Keep customers and partners updated in real time",
]}
/>

<Card
title="Fleets"
items={[
"Get clearer repair status updates",
"Reduce downtime with better communication",
"Track interactions without chasing people",
]}
/>

<Card
title="Customers"
items={[
"Receive updates without repeated calls",
"Know what’s happening and when",
"Cleaner communication end-to-end",
]}
/>
</div>
</section>

{/* FOOTER */}
<footer className="border-t">
<div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
<div>© {new Date().getFullYear()} RepairFlow Inc. (DBA RepairFLOW)</div>

<div className="flex flex-wrap gap-4">
<a className="hover:text-slate-900" href="#early-access">
Early access
</a>
<a className="hover:text-slate-900" href="#who">
Who it’s for
</a>
<a className="hover:text-slate-900" href="/privacy">
Privacy
</a>
<a className="hover:text-slate-900" href="/terms">
Terms
</a>
</div>
</div>
</footer>
</main>
);
}

function Badge({ children }: { children: React.ReactNode }) {
return (
<div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-center">
{children}
</div>
);
}

function Card({ title, items }: { title: string; items: string[] }) {
return (
<div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
<div className="text-base font-semibold">{title}</div>
<ul className="mt-3 space-y-2 text-sm text-slate-700">
{items.map((x) => (
<li key={x}>• {x}</li>
))}
</ul>
</div>
);
}

