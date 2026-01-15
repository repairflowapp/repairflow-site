"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { geocodeAddress } from "@/lib/geocode";
import { makeGeohash } from "@/lib/geo";
import PhoneInput, { isValidUSPhone, normalizeUSPhone } from "@/components/PhoneInput";
import HoursEditorGrouped, { Hours as HoursSimple } from "@/components/HoursEditorGrouped";
import { PROVIDER_TYPES, PAYMENT_TYPES } from "@/lib/providerConstants";
import { SERVICE_KEYWORDS, type ServiceKeyword } from "@/lib/SharedProviderCatalog";

type Props = {
  providerUid: string; // provider doc id
  readOnly?: boolean; // if true, disable editing/saving
};

type ProviderDoc = {
  companyName?: string | null;
  companyPhone?: string | null;
  companyAddress?: string | null;

  city?: string | null;
  state?: string | null;
  zip?: string | null;

  providerTypes?: string[];
  paymentsAccepted?: string[];
  serviceKeywords?: string[];

  dispatch247?: boolean;
  emergencyRoadside?: boolean;

  hoursSimple?: HoursSimple | null;

  geo?: { lat: number; lng: number; geohash: string } | null;

  updatedAt?: any;
  createdAt?: any;
};

function normZip(s: string) {
  const digits = (s || "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

function toggle(list: string[], value: string, set: (v: string[]) => void) {
  const safe = Array.isArray(list) ? list : [];
  set(safe.includes(value) ? safe.filter((x) => x !== value) : [...safe, value]);
}

function cleanHours(hours: HoursSimple): HoursSimple {
  return {
    mon: String(hours?.mon || "").trim(),
    tue: String(hours?.tue || "").trim(),
    wed: String(hours?.wed || "").trim(),
    thu: String(hours?.thu || "").trim(),
    fri: String(hours?.fri || "").trim(),
    sat: String(hours?.sat || "").trim(),
    sun: String(hours?.sun || "").trim(),
  };
}

function anyHours(hours: HoursSimple) {
  return Object.values(cleanHours(hours)).some((v) => !!v);
}

function uniqueStrings(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : [];
  const out: string[] = [];
  for (const raw of arr) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function uniqueCleanKeywords(list: unknown): string[] {
  const catalog = uniqueStrings(SERVICE_KEYWORDS);
  const allowed = new Set<string>(catalog);

  const arr = Array.isArray(list) ? list : [];
  const out: string[] = [];
  for (const raw of arr) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (!allowed.has(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export default function ProviderProfileForm({ providerUid, readOnly = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // form fields
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");

  const [providerTypes, setProviderTypes] = useState<string[]>([]);
  const [paymentsAccepted, setPaymentsAccepted] = useState<string[]>([]);

  const [serviceKeywords, setServiceKeywords] = useState<string[]>([]);
  const [keywordFilter, setKeywordFilter] = useState("");

  const [dispatch247, setDispatch247] = useState(false);
  const [emergencyRoadside, setEmergencyRoadside] = useState(false);

  const [hours, setHours] = useState<HoursSimple>({
    mon: "",
    tue: "",
    wed: "",
    thu: "",
    fri: "",
    sat: "",
    sun: "",
  });

  const [geoPreview, setGeoPreview] = useState<{ lat: number; lng: number } | null>(null);

  const catalogKeywords = useMemo(() => {
    return uniqueStrings(SERVICE_KEYWORDS) as ServiceKeyword[] as unknown as string[];
  }, []);

  const disabled = saving || readOnly;

  // LOAD provider doc
  useEffect(() => {
    (async () => {
      if (!providerUid?.trim()) {
        setLoading(false);
        setErr("Missing provider uid.");
        return;
      }

      setLoading(true);
      setErr(null);
      setOk(null);

      try {
        const snap = await getDoc(doc(db, "providers", providerUid));
        const data = snap.exists() ? (snap.data() as ProviderDoc) : null;

        setCompanyName(String(data?.companyName ?? ""));
        setCompanyPhone(String(data?.companyPhone ?? ""));
        setCompanyAddress(String(data?.companyAddress ?? ""));
        setCity(String(data?.city ?? ""));
        setStateCode(String(data?.state ?? ""));
        setZip(String(data?.zip ?? ""));

        setProviderTypes(Array.isArray(data?.providerTypes) ? (data!.providerTypes as string[]) : []);
        setPaymentsAccepted(Array.isArray(data?.paymentsAccepted) ? (data!.paymentsAccepted as string[]) : []);

        const loadedKeywords = Array.isArray((data as any)?.serviceKeywords) ? ((data as any).serviceKeywords as string[]) : [];
        setServiceKeywords(uniqueCleanKeywords(loadedKeywords));

        setDispatch247(!!data?.dispatch247);
        setEmergencyRoadside(!!data?.emergencyRoadside);

        const loadedHours = (data as any)?.hoursSimple;
        setHours(
          loadedHours && typeof loadedHours === "object"
            ? {
                mon: String(loadedHours.mon ?? ""),
                tue: String(loadedHours.tue ?? ""),
                wed: String(loadedHours.wed ?? ""),
                thu: String(loadedHours.thu ?? ""),
                fri: String(loadedHours.fri ?? ""),
                sat: String(loadedHours.sat ?? ""),
                sun: String(loadedHours.sun ?? ""),
              }
            : { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" }
        );

        const g = (data as any)?.geo;
        if (g?.lat != null && g?.lng != null) {
          setGeoPreview({ lat: Number(g.lat), lng: Number(g.lng) });
        } else {
          setGeoPreview(null);
        }
      } catch (e: any) {
        setErr(e?.message || "Failed to load provider profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [providerUid]);

  const canSave = useMemo(() => {
    if (readOnly) return false;
    if (!providerUid) return false;

    if (!companyName.trim()) return false;
    if (!isValidUSPhone(companyPhone)) return false;
    if (!companyAddress.trim()) return false;

    if (!city.trim()) return false;
    if (!stateCode.trim() || stateCode.trim().length !== 2) return false;
    if (normZip(zip).length !== 5) return false;

    if (!Array.isArray(providerTypes) || providerTypes.length === 0) return false;

    return true;
  }, [readOnly, providerUid, companyName, companyPhone, companyAddress, city, stateCode, zip, providerTypes]);

  async function testGeocode() {
    if (readOnly) return;

    setErr(null);
    setOk(null);

    try {
      const full = `${companyAddress}, ${city}, ${stateCode} ${normZip(zip)}`;
      const r = await geocodeAddress(full);
      setGeoPreview({ lat: r.lat, lng: r.lng });
      setOk("Geocoded successfully ✅");
      setTimeout(() => setOk(null), 2500);
    } catch (e: any) {
      setErr(e?.message || "Geocoding failed.");
    }
  }

  function toggleKeyword(k: string) {
    const key = String(k ?? "").trim();
    if (!key) return;
    setServiceKeywords((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.includes(key) ? safePrev.filter((x) => x !== key) : [...safePrev, key];
    });
  }

  const filteredKeywords = useMemo(() => {
    const q = String(keywordFilter ?? "").trim().toLowerCase();
    if (!q) return catalogKeywords;
    return catalogKeywords.filter((k) => String(k ?? "").toLowerCase().includes(q));
  }, [keywordFilter, catalogKeywords]);

  async function save() {
    if (!canSave) return;

    setErr(null);
    setOk(null);
    setSaving(true);

    try {
      const normalizedPhone = normalizeUSPhone(companyPhone);

      let latLng = geoPreview;
      if (!latLng) {
        const full = `${companyAddress}, ${city}, ${stateCode} ${normZip(zip)}`;
        const r = await geocodeAddress(full);
        latLng = { lat: r.lat, lng: r.lng };
        setGeoPreview(latLng);
      }

      const geohash = makeGeohash(latLng.lat, latLng.lng);

      const cleanedHours = cleanHours(hours);
      const storeHours = anyHours(cleanedHours) ? cleanedHours : null;

      const cleanedKeywords = uniqueCleanKeywords(serviceKeywords);

      const payload: Partial<ProviderDoc> = {
        companyName: companyName.trim(),
        companyPhone: normalizedPhone,
        companyAddress: companyAddress.trim(),

        city: city.trim(),
        state: stateCode.trim().toUpperCase(),
        zip: normZip(zip),

        providerTypes: Array.isArray(providerTypes) ? providerTypes : [],
        paymentsAccepted: Array.isArray(paymentsAccepted) ? paymentsAccepted : [],

        serviceKeywords: cleanedKeywords,

        dispatch247: !!dispatch247,
        emergencyRoadside: !!emergencyRoadside,

        hoursSimple: storeHours,

        geo: { lat: latLng.lat, lng: latLng.lng, geohash },

        updatedAt: serverTimestamp(),
      };

      // 1) Save provider doc (private)
      await setDoc(doc(db, "providers", providerUid), payload, { merge: true });

      // 2) Mirror to directory (public)
      await setDoc(
        doc(db, "businessProfiles", providerUid),
        {
          accountId: providerUid,
          providerUid,

          companyName: companyName.trim(),
          companyPhone: normalizedPhone,
          companyAddress: companyAddress.trim(),

          city: city.trim(),
          state: stateCode.trim().toUpperCase(),
          zip: normZip(zip),

          providerTypes: Array.isArray(providerTypes) ? providerTypes : [],
          paymentsAccepted: Array.isArray(paymentsAccepted) ? paymentsAccepted : [],

          serviceKeywords: cleanedKeywords,

          dispatch247: !!dispatch247,
          emergencyRoadside: !!emergencyRoadside,

          hoursSimple: storeHours,

          geo: { lat: latLng.lat, lng: latLng.lng, geohash },

          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setOk("Saved ✅");
      setTimeout(() => setOk(null), 2500);
    } catch (e: any) {
      setErr(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="border border-gray-200 rounded-2xl p-6 text-gray-700">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="border border-yellow-200 bg-yellow-50 rounded-2xl p-4 text-sm text-yellow-900">
          Read-only mode: your role can view this profile, but cannot edit it.
        </div>
      ) : null}

      {err ? (
        <div className="border border-red-200 bg-red-50 rounded-2xl p-4 text-sm text-red-800">
          <b>Error:</b> {err}
        </div>
      ) : null}

      {ok ? (
        <div className="border border-green-200 bg-green-50 rounded-2xl p-4 text-sm text-green-900">
          {ok}
        </div>
      ) : null}

      <div className="border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="text-sm font-semibold text-gray-900">Company Profile</div>

        <div>
          <label className="block text-sm font-medium mb-1">Company Name *</label>
          <input className="border rounded-lg p-2 w-full" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={disabled} />
        </div>

        <PhoneInput label="Company Phone *" required value={companyPhone} onChange={setCompanyPhone} disabled={disabled} />

        <div>
          <label className="block text-sm font-medium mb-1">Street Address *</label>
          <input className="border rounded-lg p-2 w-full" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} disabled={disabled} />
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">City *</label>
            <input className="border rounded-lg p-2 w-full" value={city} onChange={(e) => setCity(e.target.value)} disabled={disabled} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">State *</label>
            <input
              className="border rounded-lg p-2 w-full"
              value={stateCode}
              onChange={(e) => setStateCode(String(e.target.value ?? "").toUpperCase())}
              maxLength={2}
              disabled={disabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ZIP *</label>
            <input className="border rounded-lg p-2 w-full" value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" disabled={disabled} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="border border-gray-300 rounded-lg px-4 py-2 font-medium hover:bg-gray-50 disabled:opacity-50"
            onClick={testGeocode}
            disabled={disabled}
            type="button"
          >
            Test Geocode
          </button>

          <div className="text-xs text-gray-600">
            {geoPreview ? `Lat ${geoPreview.lat.toFixed(5)}, Lng ${geoPreview.lng.toFixed(5)}` : "No geo preview yet."}
          </div>
        </div>

        <label className="flex items-center gap-2 border rounded-lg p-3">
          <input type="checkbox" checked={dispatch247} onChange={() => setDispatch247((v) => !v)} disabled={disabled} />
          <span className="text-sm">24/7 Dispatch</span>
        </label>

        <label className="flex items-center gap-2 border rounded-lg p-3">
          <input type="checkbox" checked={emergencyRoadside} onChange={() => setEmergencyRoadside((v) => !v)} disabled={disabled} />
          <span className="text-sm">Emergency Roadside Assistance</span>
        </label>
      </div>

      <div className="border border-gray-200 rounded-2xl p-6 space-y-3">
        <div className="text-sm font-semibold text-gray-900">Services (Provider Types) *</div>
        <div className="grid md:grid-cols-2 gap-2">
          {PROVIDER_TYPES.map((t) => {
            const checked = providerTypes.includes(t);
            return (
              <label key={`ptype:${t}`} className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={checked} onChange={() => toggle(providerTypes, t, setProviderTypes)} disabled={disabled} />
                <span className="text-sm">{t}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="border border-gray-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Service Keywords</div>
            <div className="text-xs text-gray-600 mt-1">These help matching + directory filtering.</div>
          </div>
          <div className="text-xs text-gray-600">
            Selected: <b>{serviceKeywords.length}</b>
          </div>
        </div>

        <input
          className="border rounded-lg p-2 w-full"
          value={keywordFilter}
          onChange={(e) => setKeywordFilter(e.target.value)}
          placeholder="Search keywords…"
          disabled={disabled}
        />

        <div className="grid md:grid-cols-2 gap-2 max-h-[320px] overflow-auto border rounded-xl p-3">
          {filteredKeywords.map((k, idx) => {
            const checked = serviceKeywords.includes(String(k));
            return (
              <label key={`kw:${String(k)}:${idx}`} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checked} onChange={() => toggleKeyword(String(k))} disabled={disabled} />
                <span>{String(k)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="border border-gray-200 rounded-2xl p-6 space-y-3">
        <div className="text-sm font-semibold text-gray-900">Payments Accepted</div>
        <div className="grid md:grid-cols-3 gap-2">
          {PAYMENT_TYPES.map((p) => {
            const checked = paymentsAccepted.includes(p);
            return (
              <label key={`pay:${p}`} className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={checked} onChange={() => toggle(paymentsAccepted, p, setPaymentsAccepted)} disabled={disabled} />
                <span className="text-sm">{p}</span>
              </label>
            );
          })}
        </div>
      </div>

      <HoursEditorGrouped
        value={hours}
        onChange={setHours}
        disabled={disabled}
        title="Hours of Operation"
        subtitle={
          <>
            Use any format (example: <b>8am - 6pm</b>, <b>24 hours</b>, <b>Closed</b>).
          </>
        }
      />

      <button onClick={save} disabled={disabled || !canSave} className="w-full bg-black text-white rounded-lg py-3 font-medium disabled:opacity-50">
        {readOnly ? "Read-only" : saving ? "Saving…" : "Save Provider Profile"}
      </button>

      {!readOnly && !canSave ? (
        <div className="text-xs text-gray-500">To save: name, phone, address, city, state, zip, and at least 1 provider type are required.</div>
      ) : null}
    </div>
  );
}
