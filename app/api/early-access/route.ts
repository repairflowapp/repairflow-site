import { NextResponse } from "next/server";

export async function POST(req: Request) {
try {
const body = await req.json().catch(() => ({}));
const email = (body?.email || "").toString().trim();
const firstName = (body?.firstName || "").toString().trim();

if (!email) {
return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
}

const apiKey = process.env.CONVERTKIT_API_KEY?.trim();
const formId = process.env.CONVERTKIT_FORM_ID?.trim();

if (!apiKey || !formId) {
return NextResponse.json(
{ ok: false, error: "Server missing ConvertKit env vars (CONVERTKIT_API_KEY, CONVERTKIT_FORM_ID)." },
{ status: 500 }
);
}

const url = `https://api.convertkit.com/v3/forms/${formId}/subscribe`;

const r = await fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json; charset=utf-8" },
body: JSON.stringify({
api_key: apiKey,
email,
...(firstName ? { first_name: firstName } : {}),
}),
// avoid caching weirdness in server environments
cache: "no-store",
});

const data = await r.json().catch(() => ({}));

if (!r.ok) {
// ConvertKit commonly returns message/error fields
const msg =
data?.message ||
data?.error ||
"ConvertKit subscribe failed. Check API key + Form ID.";
return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

return NextResponse.json({ ok: true });
} catch (e: any) {
return NextResponse.json(
{ ok: false, error: e?.message || "Unexpected server error." },
{ status: 500 }
);
}
}

