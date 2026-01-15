"use client";

import { useMemo } from "react";

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
onChange: (h: Hours) => void;
disabled?: boolean;
title?: string;
};

const WEEKDAYS: (keyof Hours)[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKENDS: (keyof Hours)[] = ["sat", "sun"];

const PRESETS = {
DEFAULT: "8am - 6pm",
FULL: "24 hours",
CLOSED: "Closed",
};

function DayInput({
label,
value,
disabled,
onChange,
}: {
label: string;
value?: string;
disabled?: boolean;
onChange: (v: string) => void;
}) {
return (
<div className="flex items-center gap-3">
<div className="w-12 text-sm font-semibold">{label}</div>
<input
className="flex-1 border rounded-lg p-2"
value={value || ""}
onChange={(e) => onChange(e.target.value)}
placeholder="8am - 6pm"
disabled={disabled}
/>
<button
type="button"
className="border rounded-lg px-3 py-2 text-xs hover:bg-gray-50"
disabled={disabled}
onClick={() => onChange("")}
>
Clear
</button>
</div>
);
}

export default function HoursEditor({
value,
onChange,
disabled,
title = "Hours of Operation",
}: Props) {
const hours = useMemo<Hours>(
() => ({
mon: value.mon || "",
tue: value.tue || "",
wed: value.wed || "",
thu: value.thu || "",
fri: value.fri || "",
sat: value.sat || "",
sun: value.sun || "",
}),
[value]
);

function setGroup(days: (keyof Hours)[], v: string) {
const next = { ...hours };
days.forEach((d) => (next[d] = v));
onChange(next);
}

function setDay(day: keyof Hours, v: string) {
onChange({ ...hours, [day]: v });
}

return (
<div className="border border-gray-200 rounded-2xl p-6 space-y-4">
<div className="text-sm font-semibold text-gray-900">{title}</div>

{/* WEEKDAYS */}
<div className="border border-gray-200 rounded-xl p-4 space-y-3">
<div className="flex items-center justify-between">
<div className="text-sm font-medium">Weekdays (Mon–Fri)</div>
<div className="flex gap-2">
<button
type="button"
className="border rounded-lg px-3 py-1 text-xs hover:bg-gray-50"
disabled={disabled}
onClick={() => setGroup(WEEKDAYS, PRESETS.DEFAULT)}
>
8–6
</button>
<button
type="button"
className="border rounded-lg px-3 py-1 text-xs hover:bg-gray-50"
disabled={disabled}
onClick={() => setGroup(WEEKDAYS, PRESETS.FULL)}
>
24/7
</button>
<button
type="button"
className="border rounded-lg px-3 py-1 text-xs hover:bg-gray-50"
disabled={disabled}
onClick={() => setGroup(WEEKDAYS, PRESETS.CLOSED)}
>
Closed
</button>
</div>
</div>

<div className="space-y-2">
{WEEKDAYS.map((d) => (
<DayInput
key={d}
label={d.toUpperCase()}
value={hours[d]}
disabled={disabled}
onChange={(v) => setDay(d, v)}
/>
))}
</div>
</div>

{/* WEEKENDS */}
<div className="border border-gray-200 rounded-xl p-4 space-y-3">
<div className="flex items-center justify-between">
<div className="text-sm font-medium">Weekend (Sat–Sun)</div>
<div className="flex gap-2">
<button
type="button"
className="border rounded-lg px-3 py-1 text-xs hover:bg-gray-50"
disabled={disabled}
onClick={() => setGroup(WEEKENDS, PRESETS.DEFAULT)}
>
8–6
</button>
<button
type="button"
className="border rounded-lg px-3 py-1 text-xs hover:bg-gray-50"
disabled={disabled}
onClick={() => setGroup(WEEKENDS, PRESETS.FULL)}
>
24/7
</button>
<button
type="button"
className="border rounded-lg px-3 py-1 text-xs hover:bg-gray-50"
disabled={disabled}
onClick={() => setGroup(WEEKENDS, PRESETS.CLOSED)}
>
Closed
</button>
</div>
</div>

<div className="space-y-2">
{WEEKENDS.map((d) => (
<DayInput
key={d}
label={d.toUpperCase()}
value={hours[d]}
disabled={disabled}
onChange={(v) => setDay(d, v)}
/>
))}
</div>
</div>

<div className="text-xs text-gray-500">
Examples: <b>8am - 6pm</b>, <b>24 hours</b>, <b>Closed</b>
</div>
</div>
);
}

