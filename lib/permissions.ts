import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ViewerKind = "provider" | "dispatcher" | "tech" | "employee" | "customer" | "unknown";

export type ResolvedViewer = {
viewer: ViewerKind;
uid: string;
providerUid: string | null; // owner/provider scope for employee/dispatcher
employeeRole: "dispatcher" | "tech" | null;
activeEmployee: boolean;
};

export async function resolveViewer(uid: string): Promise<ResolvedViewer> {
const base: ResolvedViewer = {
viewer: "unknown",
uid,
providerUid: null,
employeeRole: null,
activeEmployee: false,
};

const userSnap = await getDoc(doc(db, "users", uid));
if (!userSnap.exists()) return base;

const u = userSnap.data() as any;
const role = String(u.role || "");

// Provider (owner)
if (role === "provider") {
return {
...base,
viewer: "provider",
providerUid: uid,
activeEmployee: false,
};
}

// Customer
if (role === "customer") {
return {
...base,
viewer: "customer",
providerUid: null,
activeEmployee: false,
};
}

// Employee (dispatcher/tech stored under providers/{providerUid}/employees/{uid})
if (role === "employee") {
const p = String(u.providerUid || u.providerId || "");
if (!p) {
return { ...base, viewer: "employee", providerUid: null, employeeRole: null, activeEmployee: false };
}

const empSnap = await getDoc(doc(db, "providers", p, "employees", uid));
const emp = empSnap.exists() ? (empSnap.data() as any) : null;

const empRole = String(emp?.role || "");
const active = emp?.active !== false;

if (!active) {
return { ...base, viewer: "employee", providerUid: p, employeeRole: null, activeEmployee: false };
}

if (empRole === "dispatcher") {
return { ...base, viewer: "dispatcher", providerUid: p, employeeRole: "dispatcher", activeEmployee: true };
}

// tech (default)
return { ...base, viewer: "tech", providerUid: p, employeeRole: "tech", activeEmployee: true };
}

return base;
}

