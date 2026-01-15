// src/lib/types.ts

export type JobOrigin = "marketplace" | "internal";

export type JobStatus =
| "pending_dispatch"
| "open_for_bids"
| "pending_provider_confirmation"
| "assigned"
| "enroute"
| "arrived"
| "in_progress"
| "completed"
| "canceled";

export type IssueType =
| "towing"
| "tire"
| "battery"
| "lockout"
| "repair"
| "fuel"
| "other";

export type JobPriority = "normal" | "urgent";

export type MediaItem = {
url: string;
type: "image" | "video";
createdAt: any; // Firestore Timestamp
};

export type RoadsideRequest = {
id: string;

// ownership / creation
customerUid: string | null; // null => ghost job
createdByUid: string; // dispatcher or customer uid
origin: JobOrigin;

// assignment
providerId: string | null; // providerUid (Option B)
employeeUids: string[]; // assigned tech/driver uids
assignedDispatcherUid: string | null;

// customer contact (needed for ghost jobs)
customerName: string | null;
customerPhone: string | null;
customerEmail: string | null;

// claim (Option A)
claimStatus: "unclaimed" | "claimed";
claimTokenHash: string | null; // store only hash
claimExpiresAt: any | null; // Firestore Timestamp
claimedAt: any | null;

// job details
status: JobStatus;
issueType: IssueType;
notes: string | null;
priority: JobPriority;
scheduledAt: any | null; // Firestore Timestamp

// pickup
pickupAddressText: string | null;
pickupAddressFormatted: string | null;
pickupLat: number | null;
pickupLng: number | null;

// dropoff (optional)
dropoffAddressText: string | null;
dropoffAddressFormatted: string | null;
dropoffLat: number | null;
dropoffLng: number | null;

// media
media: MediaItem[];

// timestamps
createdAt: any; // Firestore Timestamp
updatedAt: any; // Firestore Timestamp
};

