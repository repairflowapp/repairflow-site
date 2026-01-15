"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
RecaptchaVerifier,
signInWithPhoneNumber,
ConfirmationResult,
onAuthStateChanged,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { auth, functions } from "@/lib/firebase";

type UiState =
| "idle"
| "needs_phone"
| "sending_code"
| "needs_code"
| "verifying"
| "claiming"
| "success"
| "error";

function normalizeUSPhone(input: string) {
const raw = (input || "").trim();
const digits = raw.replace(/[^\d]/g, "");
// Allow: 10 digits -> +1..., 11 starting with 1 -> +..., already +...
if (raw.startsWith("+") && digits.length >= 10) return raw;
if (digits.length === 10) return `+1${digits}`;
if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
return "";
}

export default function ClaimPage() {
const params = useSearchParams();
const router = useRouter();

const jobId = params.get("jobId") || "";
const token = params.get("token") || "";

const isValidLink = useMemo(() => jobId.trim() && token.trim(), [jobId, token]);

const [ui, setUi] = useState<UiState>("idle");
const [msg, setMsg] = useState<string>("Preparing claim…");

const [phone, setPhone] = useState("");
const [code, setCode] = useState("");

const confirmationRef = useRef<ConfirmationResult | null>(null);
const recaptchaReadyRef = useRef(false);

// Create a container for invisible reCAPTCHA
// (Firebase requires an element id even for invisible)
useEffect(() => {
if (!isValidLink) {
setUi("error");
setMsg("This claim link is missing information. Please request a new link.");
return;
}

const unsub = onAuthStateChanged(auth, (user) => {
// If already signed in, claim immediately
if (user?.uid) {
void claimNow();
} else {
setUi("needs_phone");
setMsg("Enter your phone number to verify and claim your request.");
}
});

return () => unsub();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isValidLink]);

function ensureRecaptcha() {
if (recaptchaReadyRef.current) return;

// Attach to window so Firebase can reuse it if needed
// @ts-ignore
if (!window.recaptchaVerifier) {
// @ts-ignore
window.recaptchaVerifier = new RecaptchaVerifier(
auth,
"recaptcha-container",
{
size: "invisible",
callback: () => {
// reCAPTCHA solved automatically
},
}
);
}
recaptchaReadyRef.current = true;
}

async function sendCode() {
const e164 = normalizeUSPhone(phone);
if (!e164) {
setUi("error");
setMsg("Please enter a valid US phone number (e.g. 9165551234).");
return;
}

try {
setUi("sending_code");
setMsg("Sending verification code…");

ensureRecaptcha();
// @ts-ignore
const appVerifier = window.recaptchaVerifier;

const confirmation = await signInWithPhoneNumber(auth, e164, appVerifier);
confirmationRef.current = confirmation;

setUi("needs_code");
setMsg(`Code sent to ${e164}. Enter it below.`);
} catch (e: any) {
// Common: auth/too-many-requests, auth/invalid-phone-number, auth/missing-recaptcha-token
setUi("error");
setMsg(e?.message || "Failed to send code. Please try again.");
}
}

async function verifyCode() {
if (!confirmationRef.current) {
setUi("error");
setMsg("No verification session found. Please resend the code.");
return;
}
if (!code.trim()) {
setUi("error");
setMsg("Please enter the code you received.");
return;
}

try {
setUi("verifying");
setMsg("Verifying code…");

await confirmationRef.current.confirm(code.trim());

setUi("claiming");
setMsg("Verified. Claiming your request…");

await claimNow();
} catch (e: any) {
setUi("error");
setMsg(e?.message || "Invalid code. Please try again.");
}
}

async function claimNow() {
try {
setUi("claiming");
setMsg("Claiming your request…");

const fn = httpsCallable(functions, "claimRoadsideRequest");
await fn({ jobId, token });

setUi("success");
setMsg("Success! Taking you to your request…");

// Adjust this route to your actual customer job detail page:
router.replace(`/app/dashboard/customer/requests/${jobId}`);
} catch (e: any) {
const raw = e?.message || "Claim failed.";

let friendly = raw;
if (raw.includes("deadline-exceeded")) {
friendly = "This claim link has expired. Please request a new one.";
} else if (raw.includes("permission-denied")) {
friendly = "This claim link is invalid. Please request a new one.";
} else if (raw.includes("already-exists")) {
friendly =
"This request has already been claimed. If this is yours, sign in with the original account.";
} else if (raw.includes("failed-precondition")) {
friendly = "No active claim token was found. Please request a new link.";
}

setUi("error");
setMsg(friendly);
}
}

return (
<div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
<h1 style={{ fontSize: 22, fontWeight: 700 }}>Claim your TruckRSA request</h1>

<div
style={{
marginTop: 16,
padding: 12,
border: "1px solid #ddd",
borderRadius: 8,
}}
>
<div style={{ fontSize: 14, opacity: 0.9 }}>{msg}</div>

{(ui === "needs_phone" || ui === "sending_code") && (
<div style={{ marginTop: 14 }}>
<label style={{ display: "block", fontSize: 12, opacity: 0.75 }}>
Phone number
</label>
<input
value={phone}
onChange={(e) => setPhone(e.target.value)}
placeholder="9165551234"
style={{
width: "100%",
padding: "10px 12px",
borderRadius: 8,
border: "1px solid #ccc",
marginTop: 6,
}}
disabled={ui === "sending_code"}
/>
<button
onClick={sendCode}
style={{
marginTop: 12,
padding: "10px 14px",
borderRadius: 8,
border: "1px solid #ccc",
cursor: "pointer",
}}
disabled={ui === "sending_code"}
>
{ui === "sending_code" ? "Sending…" : "Send code"}
</button>
</div>
)}

{(ui === "needs_code" || ui === "verifying") && (
<div style={{ marginTop: 14 }}>
<label style={{ display: "block", fontSize: 12, opacity: 0.75 }}>
Verification code
</label>
<input
value={code}
onChange={(e) => setCode(e.target.value)}
placeholder="123456"
style={{
width: "100%",
padding: "10px 12px",
borderRadius: 8,
border: "1px solid #ccc",
marginTop: 6,
}}
disabled={ui === "verifying"}
/>
<div style={{ display: "flex", gap: 10, marginTop: 12 }}>
<button
onClick={verifyCode}
style={{
padding: "10px 14px",
borderRadius: 8,
border: "1px solid #ccc",
cursor: "pointer",
}}
disabled={ui === "verifying"}
>
{ui === "verifying" ? "Verifying…" : "Verify & claim"}
</button>
<button
onClick={() => {
confirmationRef.current = null;
setCode("");
setUi("needs_phone");
setMsg("Enter your phone number to resend a code.");
}}
style={{
padding: "10px 14px",
borderRadius: 8,
border: "1px solid #ccc",
cursor: "pointer",
}}
disabled={ui === "verifying"}
>
Resend
</button>
</div>
</div>
)}

{ui === "error" && (
<div style={{ marginTop: 16 }}>
<button
onClick={() => router.replace("/")}
style={{
padding: "10px 14px",
borderRadius: 8,
border: "1px solid #ccc",
cursor: "pointer",
}}
>
Go back home
</button>
</div>
)}
</div>

{/* Required DOM element for Firebase reCAPTCHA */}
<div id="recaptcha-container" />

<div style={{ marginTop: 16, fontSize: 12, opacity: 0.65 }}>
Link details: jobId={jobId ? jobId.slice(0, 8) + "…" : "(missing)"}
</div>
</div>
);
}