// src/lib/jobs.ts
import {
addDoc,
collection,
doc,
serverTimestamp,
updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { IssueType, JobOrigin, JobPriority, RoadsideRequest, JobStatus } from "@/lib/types";

export type CreateJobInput = {
// creator
createdByUid: string;

// customer identity
customerUid?: string | null; // if customer is logged in, pass their uid. if ghost, null.
customerName?: string | null;
customerPhone?: string | null;
customerEmail?: string | null;

// job
origin: JobOrigin; // "internal" for dispatcher-created, "marketplace" for customer-created
issueType: IssueType;
notes?: string | null;
priority?: JobPriority;
scheduledAt?: any | null;

// pickup/dropoff
pickupAddressText?: string | null;
pickupAddressFormatted?: string | null;
pickupLat?: number | null;
pickupLng?: number | null;

dropoffAddressText?: string | null;
dropoffAddressFormatted?: string | null;
dropoffLat?: number | null;
dropoffLng?: number | null;

// dispatch fields
assignedDispatcherUid?: string | null;
};

export async function createRoadsideRequest(input: CreateJobInput) {
const docRef = await addDoc(collection(db, "roadsideRequests"), {
customerUid: input.customerUid ?? null,
createdByUid: input.createdByUid,
origin: input.origin,

providerId: null,
employeeUids: [],
assignedDispatcherUid: input.assignedDispatcherUid ?? null,

customerName: input.customerName ?? null,
customerPhone: input.customerPhone ?? null,
customerEmail: input.customerEmail ?? null,

claimStatus: input.customerUid ? "claimed" : "unclaimed",
claimTokenHash: null,
claimExpiresAt: null,
claimedAt: input.customerUid ? serverTimestamp() : null,

status: input.origin === "internal" ? "pending_dispatch" : "open_for_bids",
issueType: input.issueType,
notes: input.notes ?? null,
priority: input.priority ?? "normal",
scheduledAt: input.scheduledAt ?? null,

pickupAddressText: input.pickupAddressText ?? null,
pickupAddressFormatted: input.pickupAddressFormatted ?? null,
pickupLat: input.pickupLat ?? null,
pickupLng: input.pickupLng ?? null,

dropoffAddressText: input.dropoffAddressText ?? null,
dropoffAddressFormatted: input.dropoffAddressFormatted ?? null,
dropoffLat: input.dropoffLat ?? null,
dropoffLng: input.dropoffLng ?? null,

media: [],

createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
});

return docRef.id;
}

export async function updateJobStatus(jobId: string, status: JobStatus) {
await updateDoc(doc(db, "roadsideRequests", jobId), {
status,
updatedAt: serverTimestamp(),
});
}

export async function assignProvider(jobId: string, providerUid: string) {
await updateDoc(doc(db, "roadsideRequests", jobId), {
providerId: providerUid,
status: "pending_provider_confirmation",
updatedAt: serverTimestamp(),
});
}

export async function assignEmployees(jobId: string, employeeUids: string[]) {
await updateDoc(doc(db, "roadsideRequests", jobId), {
employeeUids,
updatedAt: serverTimestamp(),
});
}

