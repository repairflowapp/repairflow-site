"use client";

import React from "react";

export type Hours = {
mon?: string;
tue?: string;
wed?: string;
thu?: string;
fri?: string;
sat?: string;
sun?: string;
};

type Props = {
value: Hours;
onChange: (v: Hours) => void;
disabled?: boolean;

title?: string;
subtitle?: React.ReactNode;
};

const DAYS = [
{ key: "mon", label: "MON" },
{ key: "tue", label: "TUE" },
{ key: "wed", label: "WED" },
{ key: "thu", label: "THU" },
{ key: "fri", label: "FRI" },
{ key: "sat", label: "SAT" },
{ key: "sun", label: "SUN" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

function setMany(current: Hours, keys: DayKey[], nextValue: string) {
const out: Hours = { ...current };
for (const k of keys) out[k] = nextValue;
return out;
}

function DayRow({
label,
value,
onChange,
disabled,
}: {
label: string;
value: string;
onChange: (v: string) => void;
disabled?: boolean;
}) {
return (
<div className="flex items-center gap-3 border rounded-xl p-3">
<div className="w-14 text-sm font-semibold text-gray-900">{label}</div>

<input
className="flex-1 border rounded-lg p-2 text-sm disabled:bg-gray-50"
value={value}
onChange={(e) => onChange(e.target.value)}
placeholder="8am - 6pm"
disabled={disabled}
/>

<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange("")}
disabled={disabled}
>
Clear
</button>
</div>
);
}

export default function HoursEditorGrouped({
value,
onChange,
disabled,
title = "Hours of Operation",
subtitle,
}: Props) {
const hours: Hours = value || {};

const weekdayKeys: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];
const weekendKeys: DayKey[] = ["sat", "sun"];

return (
<div className="border border-gray-200 rounded-2xl p-6 space-y-4">
<div className="space-y-1">
<div className="text-sm font-semibold text-gray-900">{title}</div>
{subtitle ? <div className="text-xs text-gray-600">{subtitle}</div> : null}
</div>

{/* Weekdays */}
<div className="space-y-3">
<div className="flex items-center gap-3">
<div className="text-sm font-semibold text-gray-900">Weekdays (Mon–Fri)</div>

<div className="ml-auto flex flex-wrap gap-2">
<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange(setMany(hours, weekdayKeys, "8am - 6pm"))}
disabled={disabled}
>
8–6
</button>

<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange(setMany(hours, weekdayKeys, "24 hours"))}
disabled={disabled}
>
24/7
</button>

<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange(setMany(hours, weekdayKeys, "Closed"))}
disabled={disabled}
>
Closed
</button>
</div>
</div>

<div className="grid gap-2">
<DayRow
label="MON"
value={String(hours.mon || "")}
onChange={(v) => onChange({ ...hours, mon: v })}
disabled={disabled}
/>
<DayRow
label="TUE"
value={String(hours.tue || "")}
onChange={(v) => onChange({ ...hours, tue: v })}
disabled={disabled}
/>
<DayRow
label="WED"
value={String(hours.wed || "")}
onChange={(v) => onChange({ ...hours, wed: v })}
disabled={disabled}
/>
<DayRow
label="THU"
value={String(hours.thu || "")}
onChange={(v) => onChange({ ...hours, thu: v })}
disabled={disabled}
/>
<DayRow
label="FRI"
value={String(hours.fri || "")}
onChange={(v) => onChange({ ...hours, fri: v })}
disabled={disabled}
/>
</div>
</div>

{/* Weekend */}
<div className="space-y-3 pt-2">
<div className="flex items-center gap-3">
<div className="text-sm font-semibold text-gray-900">Weekend (Sat–Sun)</div>

<div className="ml-auto flex flex-wrap gap-2">
<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange(setMany(hours, weekendKeys, "8am - 6pm"))}
disabled={disabled}
>
8–6
</button>

<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange(setMany(hours, weekendKeys, "24 hours"))}
disabled={disabled}
>
24/7
</button>

<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange(setMany(hours, weekendKeys, "Closed"))}
disabled={disabled}
>
Closed
</button>
</div>
</div>

<div className="grid gap-2">
<DayRow
label="SAT"
value={String(hours.sat || "")}
onChange={(v) => onChange({ ...hours, sat: v })}
disabled={disabled}
/>
<DayRow
label="SUN"
value={String(hours.sun || "")}
onChange={(v) => onChange({ ...hours, sun: v })}
disabled={disabled}
/>
</div>
</div>

{/* Optional: global quick actions */}
<div className="flex flex-wrap gap-2 pt-2">
<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() =>
onChange({
mon: "8am - 6pm",
tue: "8am - 6pm",
wed: "8am - 6pm",
thu: "8am - 6pm",
fri: "8am - 6pm",
sat: "8am - 6pm",
sun: "8am - 6pm",
})
}
disabled={disabled}
>
Set all 8–6
</button>

<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() =>
onChange({
mon: "Closed",
tue: "Closed",
wed: "Closed",
thu: "Closed",
fri: "Closed",
sat: "Closed",
sun: "Closed",
})
}
disabled={disabled}
>
Set all Closed
</button>

<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50 disabled:opacity-50"
onClick={() => onChange({ mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" })}
disabled={disabled}
>
Clear all
</button>
</div>
</div>
);
}
