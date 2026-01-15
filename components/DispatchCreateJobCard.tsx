"use client";

import { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, functions } from "@/lib/firebase";

function normalizePhoneToE164US(input: string) {
  const raw = (input || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+") && digits.length >= 10) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export default function DispatchCreateJobCard({
  providerUid,
}: {
  providerUid: string;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [jobId, setJobId] = useState<string>("");
  const [claimUrl, setClaimUrl] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const canCreate = useMemo(() => {
    return providerUid?.trim().length > 0;
  }, [providerUid]);

  async function createGhostJob() {
    try {
      setStatus("Creating job…");
      setJobId("");
      setClaimUrl("");

      const phoneE164 = customerPhone ? normalizePhoneToE164US(customerPhone) : "";

      // ✅ Create an INTERNAL (ghost) job:
      // - customerUid stays null until claimed
      // - providerId is set to this provider account
      const docRef = await addDoc(collection(db, "roadsideRequests"), {
        status: "pending_customer_claim",
        origin: "internal",
        isInternal: true,

        customerUid: null,
        providerId: providerUid, // ✅ IMPORTANT: unify on providerId

        customerName: customerName.trim() || null,
        customerPhone: phoneE164 || null,
        notes: notes.trim() || null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // (Optional) Store a mirror field if you like, but not required:
      // await updateDoc(doc(db, "roadsideRequests", docRef.id), { providerUid });

      setJobId(docRef.id);
      setStatus(`✅ Created ghost job: ${docRef.id}`);
    } catch (e: any) {
      setStatus(`❌ Create job failed: ${e?.message || e}`);
    }
  }

  async function generateClaimLink() {
    try {
      if (!jobId) {
        setStatus("Create a job first.");
        return;
      }
      setStatus("Generating claim link…");

      const fn = httpsCallable(functions, "createClaimToken");
      const res: any = await fn({ jobId });

      const token = res?.data?.token;
      if (!token) throw new Error("No token returned from createClaimToken");

      const url = `${window.location.origin}/claim?jobId=${encodeURIComponent(
        jobId
      )}&token=${encodeURIComponent(token)}`;

      setClaimUrl(url);
      setStatus("✅ Claim link generated");
    } catch (e: any) {
      setStatus(`❌ Claim link failed: ${e?.message || e}`);
    }
  }

  async function sendSms() {
    try {
      if (!claimUrl) {
        setStatus("Generate the claim link first.");
        return;
      }
      const to = normalizePhoneToE164US(customerPhone);
      if (!to) {
        setStatus("Enter a valid customer phone number first.");
        return;
      }

      setStatus("Sending SMS…");

      // ✅ Your backend uses Vonage now — but the callable name can stay the same.
      const fn = httpsCallable(functions, "sendClaimSms");
      await fn({
        toPhone: to,
        claimUrl,
        customerName: customerName.trim() || undefined,
        jobId,
      });

      setStatus("✅ SMS sent");
    } catch (e: any) {
      setStatus(`❌ SMS failed: ${e?.message || e}`);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
        Dispatch: Create Ghost Job
      </h3>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7 }}>
            Customer name (optional)
          </label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
            placeholder="John Doe"
          />
        </div>

        <div>
          <label style={{ fontSize: 12, opacity: 0.7 }}>
            Customer phone (optional, needed for SMS)
          </label>
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
            placeholder="9165551234"
          />
        </div>

        <div>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              minHeight: 80,
            }}
            placeholder="Customer needs tire service…"
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            disabled={!canCreate}
            onClick={createGhostJob}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            1) Create ghost job
          </button>

          <button
            disabled={!jobId}
            onClick={generateClaimLink}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            2) Generate claim link
          </button>

          <button
            disabled={!claimUrl}
            onClick={sendSms}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            3) Send SMS
          </button>
        </div>

        {jobId && (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Job ID: <b>{jobId}</b>
          </div>
        )}

        {claimUrl && (
          <div style={{ fontSize: 12 }}>
            Claim URL:
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <input
                readOnly
                value={claimUrl}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                }}
              />
              <button
                onClick={() => navigator.clipboard.writeText(claimUrl)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {status && <div style={{ fontSize: 12, opacity: 0.85 }}>{status}</div>}
      </div>
    </div>
  );
}
