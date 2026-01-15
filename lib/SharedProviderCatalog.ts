// lib/SharedProviderCatalog.ts

/* =====================================================
TIER 1: CANONICAL CATEGORIES (STABLE KEYS)
Used for routing/matching + directory filters.
===================================================== */

export const PROVIDER_CATEGORIES = [
"repair_shop",
"mobile_mechanic",
"towing",
"tire_shop",
"roadside_tire_service",
"truck_stop",
"truck_parking",
"truck_parts_store",
"truck_wash",
"reefer_trailer_repair",
"locksmith",
"dealer",
"junkyard",
"glass_shop",
"transmission_shop",
] as const;

export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];

export const PROVIDER_CATEGORY_LABELS: Record<ProviderCategory, string> = {
repair_shop: "Repair Shop",
mobile_mechanic: "Mobile Mechanic",
towing: "Towing",
tire_shop: "Tire Shop",
roadside_tire_service: "Roadside Tire Service",
truck_stop: "Truck Stop",
truck_parking: "Truck Parking",
truck_parts_store: "Parts Store",
truck_wash: "Truck Wash",
reefer_trailer_repair: "Reefer / Trailer Repair",
locksmith: "Locksmith",
dealer: "Dealer",
junkyard: "Junkyard",
glass_shop: "Glass Shop",
transmission_shop: "Transmission Shop",
};

/* =====================================================
TIER 2: PROVIDER TYPES (WHAT USERS SELECT IN UI)
Each type maps to exactly one category.
===================================================== */

export const PROVIDER_TYPES = [
"Mobile Truck Repair",
"Mobile Truck Tires",
"Mobile Car Repair",
"Mobile Car Tires",

"Truck Repair Shops",
"Car Repair Shops",
"Trailer Repair Shops",
"Reefer Repair Shops",

"Truck Tire Shops",
"Car Tire Shops",

"Light Duty Towing Services",
"Heavy Duty Towing Services",

"Truck Stops",
"Truck Parts Stores",
"Car Auto Parts Stores",

"Locksmiths",

"Truck Dealer",
"Car Dealer",
"Trailer Dealer",

"Truck Wash",
"Reefer Repair",

"Car Glass Shops",
"Transmission Shops",
"Car Junkyards",
"Truck Junkyards",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_TYPE_TO_CATEGORY: Record<ProviderType, ProviderCategory> = {
"Mobile Truck Repair": "mobile_mechanic",
"Mobile Truck Tires": "roadside_tire_service",
"Mobile Car Repair": "mobile_mechanic",
"Mobile Car Tires": "roadside_tire_service",

"Truck Repair Shops": "repair_shop",
"Car Repair Shops": "repair_shop",
"Trailer Repair Shops": "reefer_trailer_repair",
"Reefer Repair Shops": "reefer_trailer_repair",

"Truck Tire Shops": "tire_shop",
"Car Tire Shops": "tire_shop",

"Light Duty Towing Services": "towing",
"Heavy Duty Towing Services": "towing",

"Truck Stops": "truck_stop",
"Truck Parts Stores": "truck_parts_store",
"Car Auto Parts Stores": "truck_parts_store",

Locksmiths: "locksmith",

"Truck Dealer": "dealer",
"Car Dealer": "dealer",
"Trailer Dealer": "dealer",

"Truck Wash": "truck_wash",
"Reefer Repair": "reefer_trailer_repair",

"Car Glass Shops": "glass_shop",
"Transmission Shops": "transmission_shop",
"Car Junkyards": "junkyard",
"Truck Junkyards": "junkyard",
};

/* =====================================================
PAYMENTS (KEEP AS-IS)
===================================================== */

export const PAYMENT_TYPES = [
"Cash",
"Credit Cards",
"Cash App",
"Venmo",
"Zelle",
"Paypal",
"Apple Pay",
"Google Pay",
"Samsung Pay",
"EFS",
"Comcheck",
"T-Check",
"ACH",
"Net 15",
"Net 30",
"Net 60",
"Net 90",
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

/* =====================================================
SERVICE KEYWORDS (OPTIONAL SERVICES)
Providers pick what they offer; customers can pick what they need.

IMPORTANT:
- React requires unique keys when rendering lists.
- Your old list contained duplicates (Aftermarket Parts, Auto Parts, Car Parts, OEM Parts).
- We dedupe once here so every UI that maps SERVICE_KEYWORDS is safe.
===================================================== */

// 1) Keep raw list easy to edit (can contain dupes by mistake)
const SERVICE_KEYWORDS_RAW = [
// Roadside / emergency
"24 Hour Service",
"Roadside Service",
"Jump Starts",
"Lockout Service",
"Fuel Delivery",
"Accident Cleanup",
"Hazmat Cleanup",

// Mechanical
"Computer Diagnostics",
"Electrical Repair",
"Engine Repair",
"Brakes",
"Suspension",
"Drivetrain",
"Cooling System Repair",
"Radiators",
"Transmission",
"Transmission Parts",

// Tires
"New Tires",
"Used Tires",
"Recap Tires",
"Tire Repairs",
"Wheel Balance",
"Wheel Alignment",

// Maintenance
"Oil Change & Lube",
"PM Service",
"DOT Inspections",
"Fleet Maintenance",
"Mobile Maintenance",

// Welding / fabrication
"Mobile Welding",
"Welding Service",

// Parts & stores
"General Truck Parts",
"General Trailer Parts",
"Aftermarket Parts",
"OEM Parts",
"Auto Parts",
"Car Parts",

// Reefer
"Reefer Repairs",
"APU Service",
"APU Parts",

// Towing / recovery
"Light Duty Towing",
"Heavy Duty Towing",
"Load Shifts",
"Load Transfers",
"Equipment Transport",

// extra automotive keywords you gave
"Auto",
"Automobile",
"Automotive",
"Automotive Industry",
"Car",
"Vehicle",
"Motor Vehicle",
"Auto Repair",
"Car Repair",
"Car Maintenance",
"Car Dealership",
"Car Repair Shop",
"Collision Repair",
"Auto Body Shop",
"Auto Body Mechanic",
"Auto Bodywork Mechanic",
"Auto Collision Repair",
"Auto Mechanic",
"Car Collision Repair",
"Car Mechanic",
"Hybrid Car Repair",
"New Cars",
"Used Cars",
// (duplicates below are intentionally NOT repeated here anymore)
"Car Accessories",
"Mobile Mechanic",
"Truck Dealer",
"Car Dealer",
"Trailer Dealer",
"Truck Wash",
] as const;

// 2) Dedupe helper (preserves first occurrence order)
function dedupeStrings<T extends readonly string[]>(arr: T): string[] {
const seen = new Set<string>();
const out: string[] = [];
for (const s of arr as readonly string[]) {
const v = String(s).trim();
if (!v) continue;
if (seen.has(v)) continue;
seen.add(v);
out.push(v);
}
return out;
}

// 3) Export the deduped catalog used by UI
export const SERVICE_KEYWORDS = dedupeStrings(SERVICE_KEYWORDS_RAW) as readonly string[];

// 4) Typed keyword union for strong typing elsewhere
export type ServiceKeyword = (typeof SERVICE_KEYWORDS)[number];

/* =====================================================
COMMON SUGGESTED SERVICES PER PROVIDER TYPE
(Drives customer UI suggestions when provider type selected)
===================================================== */

export const COMMON_SERVICES_BY_TYPE: Record<ProviderType, readonly ServiceKeyword[]> = {
"Mobile Truck Repair": ["Roadside Service", "Computer Diagnostics", "Electrical Repair", "Brakes", "Engine Repair"],
"Mobile Truck Tires": ["Roadside Service", "New Tires", "Tire Repairs", "Used Tires"],
"Mobile Car Repair": ["Roadside Service", "Computer Diagnostics", "Electrical Repair", "Brakes", "Engine Repair"],
"Mobile Car Tires": ["Roadside Service", "New Tires", "Tire Repairs", "Used Tires"],

"Truck Repair Shops": ["Computer Diagnostics", "Brakes", "Engine Repair", "PM Service", "DOT Inspections"],
"Car Repair Shops": ["Auto Repair", "Car Repair", "Brakes", "Engine Repair", "Computer Diagnostics"],
"Trailer Repair Shops": ["Reefer Repairs", "Electrical Repair", "Cooling System Repair"],
"Reefer Repair Shops": ["Reefer Repairs", "APU Service", "Electrical Repair", "Cooling System Repair"],

"Truck Tire Shops": ["New Tires", "Used Tires", "Tire Repairs", "Wheel Balance"],
"Car Tire Shops": ["New Tires", "Used Tires", "Tire Repairs", "Wheel Balance"],

"Light Duty Towing Services": ["Light Duty Towing", "Accident Cleanup"],
"Heavy Duty Towing Services": ["Heavy Duty Towing", "Load Shifts", "Load Transfers"],

"Truck Stops": ["24 Hour Service", "Roadside Service", "Fuel Delivery"],
"Truck Parts Stores": ["General Truck Parts", "Aftermarket Parts", "OEM Parts"],
"Car Auto Parts Stores": ["Auto Parts", "Car Parts", "Aftermarket Parts"],

Locksmiths: ["Lockout Service"],

"Truck Dealer": ["Vehicle", "New Cars", "Used Cars"],
"Car Dealer": ["Car", "New Cars", "Used Cars"],
"Trailer Dealer": ["Vehicle"],

"Truck Wash": ["Accident Cleanup"],
"Reefer Repair": ["Reefer Repairs", "APU Service", "Electrical Repair"],

"Car Glass Shops": ["Collision Repair", "Auto Body Shop"],
"Transmission Shops": ["Transmission", "Transmission Parts"],
"Car Junkyards": ["Car Parts", "Aftermarket Parts"],
"Truck Junkyards": ["General Truck Parts", "Aftermarket Parts"],
};

