export const PROVIDER_CATEGORIES = [
"repair_shop",
"parts_store",
"towing_provider",
"fleet",
"customer",
] as const;

export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number];

export const PROVIDER_CATEGORY_LABELS: Record<ProviderCategory, string> = {
repair_shop: "Truck & Auto Repair Shop",
parts_store: "Truck & Auto Parts Store",
towing_provider: "Towing & Roadside Assistance Provider",
fleet: "Fleet",
customer: "Customer",
};