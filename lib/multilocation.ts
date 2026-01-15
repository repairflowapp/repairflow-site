export type ProviderAccount = {
ownerUid: string;
accountName: string;
isMultiLocation: true;
createdAt?: any;
updatedAt?: any;
};

export type ProviderLocation = {
locationName: string;

companyPhone?: string | null;
companyAddress?: string | null;
city?: string | null;
state?: string | null;
zip?: string | null;

providerTypes: string[];
paymentsAccepted?: string[];

dispatch247?: boolean;
emergencyRoadside?: boolean;

hours?: Record<string, string>; // mon..sun simple strings

geo?: { lat: number; lng: number; geohash: string } | null;

// directory sync
publicProfileId: string; // businessProfiles doc id
isActive: boolean;

createdAt?: any;
updatedAt?: any;
};

export type BusinessProfileDirectoryCard = {
// existing fields you already use
providerUid?: string;

companyName?: string | null;
companyPhone?: string | null;
companyAddress?: string | null;

city?: string | null;
state?: string | null;
zip?: string | null;

providerTypes?: string[];
paymentsAccepted?: string[];

dispatch247?: boolean;
emergencyRoadside?: boolean;

hours?: Record<string, any> | null;

ratingAvg?: number | null;
ratingCount?: number | null;

geo?: { lat: number; lng: number; geohash: string } | null;

// NEW for multi-location
isMultiLocation?: boolean;
accountId?: string;
accountName?: string;
locationId?: string;
locationName?: string;

updatedAt?: any;
};

