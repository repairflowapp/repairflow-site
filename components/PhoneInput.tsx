"use client";

import { useMemo } from "react";

type Props = {
label?: string;
required?: boolean;
value?: string | null;
onChange: (v: string) => void;
disabled?: boolean;
placeholder?: string;
};

/** Keep only digits */
function digitsOnly(v: any) {
return String(v ?? "").replace(/\D/g, "");
}

/** Normalize to E.164 +1XXXXXXXXXX if possible, else return "" or partial "+1..." */
export function normalizeUSPhone(v: any) {
const d = digitsOnly(v);

// If user typed 11 digits starting with 1
if (d.length === 11 && d.startsWith("1")) return `+${d}`;

// If user typed 10 digits
if (d.length === 10) return `+1${d}`;

// If user typed something shorter, keep it as "+1" + what they have (optional)
// but don’t pretend it’s valid
if (d.length > 0 && d.length < 10) return `+1${d.slice(0, 10)}`;

return "";
}

export function isValidUSPhone(v: any) {
const d = digitsOnly(v);

// valid if 10 digits, or 11 digits with leading 1
if (d.length === 10) return true;
if (d.length === 11 && d.startsWith("1")) return true;
return false;
}

/** Pretty display: (555) 555-5555 */
function formatPrettyUS(v: any) {
const d = digitsOnly(v);

// Strip leading 1 for formatting
const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;

if (ten.length === 0) return "";
if (ten.length <= 3) return `(${ten}`;
if (ten.length <= 6) return `(${ten.slice(0, 3)}) ${ten.slice(3)}`;
return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6, 10)}`;
}

export default function PhoneInput({
label = "Phone",
required,
value,
onChange,
disabled,
placeholder = "(555) 555-5555",
}: Props) {
// ✅ Always treat undefined/null as empty string
const safeValue = String(value ?? "");

const pretty = useMemo(() => formatPrettyUS(safeValue), [safeValue]);

return (
<div>
<label className="block text-sm font-medium mb-1">
{label} {required ? "*" : ""}
</label>

<input
className="border rounded-lg p-2 w-full"
value={pretty}
disabled={disabled}
placeholder={placeholder}
inputMode="tel"
onChange={(e) => {
// Convert what user typed into digits, then build +1...
const next = normalizeUSPhone(e.target.value);
onChange(next);
}}
/>

<div className="text-xs text-gray-500 mt-1">Auto-formats to +1XXXXXXXXXX</div>
</div>
);
}

