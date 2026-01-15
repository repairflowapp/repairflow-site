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
"Truck Parking",
"Truck Parts Stores",
"Car Auto Parts Stores",

"Locksmiths",

"Truck Dealer",
"Car Dealer",
"Trailer Dealer",

"Truck Wash",
"Reefer Repair",

// ✅ New types
"Car Glass Shops",
"Transmission Shops",
"Car Junkyards",
"Truck Junkyards",
] as const;

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
"Comchek",
"T-Chek",
"ACH",

"Net 15",
"Net 30",
"Net 60",
"Net 90",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];

// Optional (next step): standard employee roles
export const EMPLOYEE_ROLES = ["owner", "admin", "manager", "dispatcher", "technician"] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

