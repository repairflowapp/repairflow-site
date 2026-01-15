"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
addDoc,
collection,
doc,
getDoc,
onSnapshot,
orderBy,
query,
serverTimestamp,
updateDoc,
limit,
} from "firebase/firestore";
import { auth, db, storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, type UploadTask } from "firebase/storage";

type DispatchJob = {
id: string;
providerId: string;

title?: string | null;
pickupAddress?: string | null;
dropoffAddress?: string | null;

customerName?: string | null;
customerPhone?: string | null;
vehicle?: string | null;
trailer?: string | null;

notes?: string | null;

status?: string | null;
priority?: string | null;

assignedToEmployeeId?: string | null;
assignedToUserId?: string | null;
assignedToName?: string | null;
assignedToPhone?: string | null;

updatedAt?: any;
createdAt?: any;
};

type ChatMsg = {
id: string;
senderId: string;
senderRole?: "employee" | "dispatcher" | "customer" | null;

text?: string;
createdAt?: any;

mediaUrl?: string | null;
mediaType?: "image" | "video" | null;
mediaContentType?: string | null;
mediaPath?: string | null;
};

function formatTime(ts: any) {
try {
if (!ts) return "";
const d = ts?.toDate ? ts.toDate() : new Date(ts);
return d.toLocaleString();
} catch {
return "";
}
}

function isImage(ct: string) {
return ct.startsWith("image/");
}
function isVideo(ct: string) {
return ct.startsWith("video/");
}

function titleCase(s?: string) {
return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DispatchJobPage() {
const router = useRouter();
const params = useParams();
const jobId = (params?.jobId as string) || "";

const [uid, setUid] = useState<string | null>(null);

useEffect(() => {
const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
return () => unsub();
}, []);

const [job, setJob] = useState<DispatchJob | null>(null);
const [loading, setLoading] = useState(true);
const [permError, setPermError] = useState<string | null>(null);

useEffect(() => {
if (!jobId) return;

const ref = doc(db, "dispatchJobs", jobId);
const unsub = onSnapshot(
ref,
(snap) => {
setLoading(false);
if (!snap.exists()) return setJob(null);
setJob({ id: snap.id, ...(snap.data() as any) });
},
(err) => {
setLoading(false);
setJob(null);
setPermError(err?.message ?? "Failed to load dispatch job.");
}
);

return () => unsub();
}, [jobId]);

// ✅ permissions:
// allow provider (job.providerId) OR assigned employee (job.assignedToUserId)
const canView = useMemo(() => {
if (!uid || !job) return false;
return uid === job.providerId || (!!job.assignedToUserId && uid === job.assignedToUserId);
}, [uid, job]);

useEffect(() => {
if (!loading && job && uid && !canView) {
setPermError("You don’t have access to this dispatch job. (Not provider or assigned employee.)");
}
}, [loading, job, uid, canView]);

// NOTES upload
const [notesText, setNotesText] = useState("");
const [savingNotes, setSavingNotes] = useState(false);
const [notesError, setNotesError] = useState<string | null>(null);

useEffect(() => {
setNotesText(job?.notes || "");
}, [job?.notes]);

async function saveNotes() {
setNotesError(null);
if (!jobId || !uid || !job) return;
if (!canView) return setNotesError("No permission.");

setSavingNotes(true);
try {
await updateDoc(doc(db, "dispatchJobs", jobId), {
notes: notesText.trim() || null,
updatedAt: serverTimestamp(),
});
} catch (e: any) {
setNotesError(e?.message ?? "Failed to save notes.");
} finally {
setSavingNotes(false);
}
}

// Upload helper (used for notes attachments + chats)
async function uploadFile(scope: "customer" | "internal" | "notes", file: File) {
if (!uid) throw new Error("Not signed in.");
const ct = file.type || "";
const maxBytes = 25 * 1024 * 1024;
if (!(isImage(ct) || isVideo(ct))) throw new Error("Only images or videos allowed.");
if (file.size > maxBytes) throw new Error("File too large (25MB max).");

const safeName = file.name.replace(/[^\w.\-]+/g, "_");
const fileName = `${Date.now()}_${safeName}`;
const path = `dispatchMedia/dispatchJobs/${jobId}/${scope}/${uid}/${fileName}`;

const r = storageRef(storage, path);
const task: UploadTask = uploadBytesResumable(r, file, { contentType: ct });

const url = await new Promise<string>((resolve, reject) => {
task.on(
"state_changed",
() => {},
(err) => reject(err),
async () => resolve(await getDownloadURL(task.snapshot.ref))
);
});

return { url, ct, path, mediaType: isImage(ct) ? ("image" as const) : ("video" as const) };
}

// NOTES attachment
const notesFileRef = useRef<HTMLInputElement | null>(null);
const [notesUploading, setNotesUploading] = useState(false);
const [notesUploadError, setNotesUploadError] = useState<string | null>(null);

async function uploadNotesAttachment(file: File) {
setNotesUploadError(null);
if (!jobId || !uid || !job) return;
if (!canView) return setNotesUploadError("No permission.");

setNotesUploading(true);
try {
const up = await uploadFile("notes", file);

// store attachment message in internal chat for audit trail
await addDoc(collection(db, "dispatchJobs", jobId, "chat_internal"), {
senderId: uid,
senderRole: uid === job.providerId ? "dispatcher" : "employee",
text: `Uploaded notes attachment: ${file.name}`,
mediaUrl: up.url,
mediaType: up.mediaType,
mediaContentType: up.ct,
mediaPath: up.path,
createdAt: serverTimestamp(),
});
} catch (e: any) {
setNotesUploadError(e?.message ?? "Upload failed.");
} finally {
setNotesUploading(false);
}
}

// CHAT: customer
const [custMsgs, setCustMsgs] = useState<ChatMsg[]>([]);
const [custText, setCustText] = useState("");
const [custErr, setCustErr] = useState<string | null>(null);
const custEndRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
custEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [custMsgs]);

useEffect(() => {
if (!jobId || !canView) return;
const ref = collection(db, "dispatchJobs", jobId, "chat_customer");
const q = query(ref, orderBy("createdAt", "asc"), limit(200));

const unsub = onSnapshot(
q,
(snap) => setCustMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatMsg[]),
(err) => setCustErr(err?.message ?? "Failed to load customer chat.")
);
return () => unsub();
}, [jobId, canView]);

async function sendCustomerText() {
setCustErr(null);
if (!uid || !job) return;
if (!canView) return setCustErr("No permission.");

const text = custText.trim();
if (!text) return;

await addDoc(collection(db, "dispatchJobs", jobId, "chat_customer"), {
senderId: uid,
senderRole: uid === job.providerId ? "dispatcher" : "employee",
text,
createdAt: serverTimestamp(),
});
setCustText("");
}

// CHAT: internal (employee ↔ dispatcher)
const [intMsgs, setIntMsgs] = useState<ChatMsg[]>([]);
const [intText, setIntText] = useState("");
const [intErr, setIntErr] = useState<string | null>(null);
const intEndRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
intEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [intMsgs]);

useEffect(() => {
if (!jobId || !canView) return;
const ref = collection(db, "dispatchJobs", jobId, "chat_internal");
const q = query(ref, orderBy("createdAt", "asc"), limit(200));

const unsub = onSnapshot(
q,
(snap) => setIntMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChatMsg[]),
(err) => setIntErr(err?.message ?? "Failed to load internal chat.")
);
return () => unsub();
}, [jobId, canView]);

async function sendInternalText() {
setIntErr(null);
if (!uid || !job) return;
if (!canView) return setIntErr("No permission.");

const text = intText.trim();
if (!text) return;

await addDoc(collection(db, "dispatchJobs", jobId, "chat_internal"), {
senderId: uid,
senderRole: uid === job.providerId ? "dispatcher" : "employee",
text,
createdAt: serverTimestamp(),
});
setIntText("");
}

// Uploads in chats
const custFileRef = useRef<HTMLInputElement | null>(null);
const intFileRef = useRef<HTMLInputElement | null>(null);
const [uploading, setUploading] = useState<null | "customer" | "internal">(null);
const [uploadErr, setUploadErr] = useState<string | null>(null);

async function uploadToChat(scope: "customer" | "internal", file: File) {
setUploadErr(null);
if (!uid || !job) return;
if (!canView) return setUploadErr("No permission.");

setUploading(scope);
try {
const up = await uploadFile(scope, file);

await addDoc(collection(db, "dispatchJobs", jobId, scope === "customer" ? "chat_customer" : "chat_internal"), {
senderId: uid,
senderRole: uid === job.providerId ? "dispatcher" : "employee",
text: "",
mediaUrl: up.url,
mediaType: up.mediaType,
mediaContentType: up.ct,
mediaPath: up.path,
createdAt: serverTimestamp(),
});
} catch (e: any) {
setUploadErr(e?.message ?? "Upload failed.");
} finally {
setUploading(null);
}
}

if (!uid) {
return (
<div className="p-6">
<div className="border rounded-xl p-4">Please sign in.</div>
</div>
);
}

if (loading) {
return (
<div className="p-6">
<div className="border rounded-xl p-4">Loading…</div>
</div>
);
}

if (!job) {
return (
<div className="p-6">
<div className="border rounded-xl p-4">Dispatch job not found.</div>
</div>
);
}

if (!canView) {
return (
<div className="p-6">
<button onClick={() => router.push("/dashboard/provider?tab=dispatch")} className="border rounded-lg px-4 py-2 mb-3">
← Back
</button>
<div className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-800">
{permError || "No permission."}
</div>
</div>
);
}

return (
<div className="p-6 max-w-4xl mx-auto">
<button onClick={() => router.push("/dashboard/provider?tab=dispatch")} className="border rounded-lg px-4 py-2 mb-4">
← Back to Dispatch
</button>

<div className="border rounded-2xl p-5">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-2xl font-bold">{job.title || "Dispatch Job"}</div>
<div className="text-sm text-gray-600 mt-1">
Status: <b>{titleCase(job.status || "new")}</b> • Priority: <b>{titleCase(job.priority || "normal")}</b>
</div>
</div>
<div className="text-sm text-gray-600">
Assigned: <b>{job.assignedToName || "—"}</b>
</div>
</div>

<div className="mt-4 grid gap-2 text-sm">
<div><b>Pickup:</b> {job.pickupAddress || "—"}</div>
{job.dropoffAddress ? <div><b>Dropoff:</b> {job.dropoffAddress}</div> : null}
<div><b>Customer:</b> {job.customerName || "—"} {job.customerPhone ? `• ${job.customerPhone}` : ""}</div>
<div><b>Vehicle:</b> {job.vehicle || "—"} {job.trailer ? `• Trailer: ${job.trailer}` : ""}</div>
</div>

<div className="mt-5">
<div className="font-semibold mb-2">Notes</div>
{notesError ? <div className="text-sm text-red-700 mb-2">{notesError}</div> : null}
<textarea
className="border rounded-lg p-2 w-full"
rows={4}
value={notesText}
onChange={(e) => setNotesText(e.target.value)}
placeholder="Details for employee / dispatcher…"
/>
<div className="mt-2 flex gap-2 flex-wrap">
<button
onClick={saveNotes}
disabled={savingNotes}
className="bg-black text-white rounded-lg px-4 py-2 disabled:opacity-50"
>
{savingNotes ? "Saving…" : "Save Notes"}
</button>

<input
ref={notesFileRef}
type="file"
accept="image/*,video/*"
style={{ display: "none" }}
onChange={(e) => {
const f = e.target.files?.[0];
if (!f) return;
e.target.value = "";
uploadNotesAttachment(f);
}}
/>
<button
onClick={() => notesFileRef.current?.click()}
disabled={notesUploading}
className="border rounded-lg px-4 py-2 disabled:opacity-50"
>
{notesUploading ? "Uploading…" : "Upload to Notes"}
</button>
</div>
{notesUploadError ? <div className="text-xs text-red-700 mt-2">{notesUploadError}</div> : null}
</div>
</div>

{uploadErr ? <div className="mt-4 border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-800">{uploadErr}</div> : null}

{/* Customer chat */}
<div className="mt-6 border rounded-2xl p-5">
<div className="text-lg font-semibold mb-2">Chat with Customer</div>
{custErr ? <div className="text-sm text-red-700 mb-2">{custErr}</div> : null}

<div className="border rounded-xl p-3 h-72 overflow-auto bg-gray-50">
{custMsgs.length === 0 ? (
<div className="text-sm text-gray-600">No messages yet.</div>
) : (
custMsgs.map((m) => {
const mine = m.senderId === uid;
return (
<div key={m.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
<div className="max-w-[85%] bg-white border rounded-xl p-2">
<div className="text-xs text-gray-500 mb-1">
{mine ? "You" : "Other"} • {formatTime(m.createdAt)}
</div>

{m.mediaUrl && m.mediaType === "image" ? (
// eslint-disable-next-line @next/next/no-img-element
<img src={m.mediaUrl} alt="attachment" className="max-w-full rounded-lg border mb-2" />
) : null}

{m.mediaUrl && m.mediaType === "video" ? (
<video src={m.mediaUrl} controls className="max-w-full rounded-lg border mb-2" />
) : null}

{m.text ? <div className="whitespace-pre-wrap text-sm">{m.text}</div> : null}
</div>
</div>
);
})
)}
<div ref={custEndRef} />
</div>

<div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
<textarea className="border rounded-lg p-2" rows={2} value={custText} onChange={(e) => setCustText(e.target.value)} />
<input
ref={custFileRef}
type="file"
accept="image/*,video/*"
style={{ display: "none" }}
onChange={(e) => {
const f = e.target.files?.[0];
if (!f) return;
e.target.value = "";
uploadToChat("customer", f);
}}
/>
<button onClick={() => custFileRef.current?.click()} disabled={uploading === "customer"} className="border rounded-lg px-4 py-2 disabled:opacity-50">
{uploading === "customer" ? "Uploading…" : "📎"}
</button>
<button onClick={sendCustomerText} className="bg-black text-white rounded-lg px-4 py-2">
Send
</button>
</div>
</div>

{/* Internal chat */}
<div className="mt-6 border rounded-2xl p-5">
<div className="text-lg font-semibold mb-2">Internal Chat (Employee ↔ Dispatcher)</div>
{intErr ? <div className="text-sm text-red-700 mb-2">{intErr}</div> : null}

<div className="border rounded-xl p-3 h-72 overflow-auto bg-gray-50">
{intMsgs.length === 0 ? (
<div className="text-sm text-gray-600">No messages yet.</div>
) : (
intMsgs.map((m) => {
const mine = m.senderId === uid;
return (
<div key={m.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
<div className="max-w-[85%] bg-white border rounded-xl p-2">
<div className="text-xs text-gray-500 mb-1">
{mine ? "You" : "Other"} • {formatTime(m.createdAt)}
</div>

{m.mediaUrl && m.mediaType === "image" ? (
// eslint-disable-next-line @next/next/no-img-element
<img src={m.mediaUrl} alt="attachment" className="max-w-full rounded-lg border mb-2" />
) : null}

{m.mediaUrl && m.mediaType === "video" ? (
<video src={m.mediaUrl} controls className="max-w-full rounded-lg border mb-2" />
) : null}

{m.text ? <div className="whitespace-pre-wrap text-sm">{m.text}</div> : null}
</div>
</div>
);
})
)}
<div ref={intEndRef} />
</div>

<div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
<textarea className="border rounded-lg p-2" rows={2} value={intText} onChange={(e) => setIntText(e.target.value)} />
<input
ref={intFileRef}
type="file"
accept="image/*,video/*"
style={{ display: "none" }}
onChange={(e) => {
const f = e.target.files?.[0];
if (!f) return;
e.target.value = "";
uploadToChat("internal", f);
}}
/>
<button onClick={() => intFileRef.current?.click()} disabled={uploading === "internal"} className="border rounded-lg px-4 py-2 disabled:opacity-50">
{uploading === "internal" ? "Uploading…" : "📎"}
</button>
<button onClick={sendInternalText} className="bg-black text-white rounded-lg px-4 py-2">
Send
</button>
</div>
</div>
</div>
);
}
