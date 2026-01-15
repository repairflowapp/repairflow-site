// components/JobChat.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Props = {
  jobPath: string[]; // ["roadsideRequests", requestId]
  room: "main" | "internal" | string;
  currentUserId: string;
  currentUserRole?: string;
  title?: string;
  subtitle?: string;
};

type ChatMsg = {
  id: string;
  text?: string;
  senderUid?: string;
  senderRole?: string;
  senderName?: string;
  createdAt?: any;
};

export default function JobChat({
  jobPath,
  room,
  currentUserId,
  currentUserRole,
  title,
  subtitle,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ✅ Canonical path:
  // roadsideRequests/{jobId}/chatThreads/{room}/messages
  const messagesCol = useMemo(() => {
    if (!jobPath || jobPath.length < 2) return null;
    if (!room) return null;
    return collection(db, ...jobPath, "chatThreads", room, "messages");
  }, [jobPath, room]);

  useEffect(() => {
    setErr(null);

    if (!messagesCol) {
      setLoading(false);
      setMessages([]);
      return;
    }

    setLoading(true);
    const q = query(messagesCol, orderBy("createdAt", "asc"), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ChatMsg[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setMessages(rows);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      },
      (e) => {
        setErr(e?.message || "Chat failed to load.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [messagesCol]);

  async function send() {
    setErr(null);
    const t = text.trim();
    if (!t) return;
    if (!messagesCol) return;

    setText("");
    try {
      await addDoc(messagesCol, {
        text: t,
        senderUid: currentUserId,
        senderRole: currentUserRole || null,
        createdAt: serverTimestamp(),
      });
    } catch (e: any) {
      setErr(e?.message || "Failed to send message.");
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>{title || "Chat"}</div>
      {subtitle ? <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>{subtitle}</div> : null}

      {err ? (
        <div style={{ color: "red", marginBottom: 8 }}>
          {err.includes("Missing or insufficient permissions")
            ? "Error: Missing permissions. (This usually means Firestore rules or the user role is not set correctly.)"
            : err}
        </div>
      ) : null}

      <div
        style={{
          height: 260,
          overflow: "auto",
          border: "1px solid #eee",
          borderRadius: 10,
          padding: 10,
          background: "#fff",
        }}
      >
        {loading ? (
          <div style={{ opacity: 0.7 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No messages yet.</div>
        ) : (
          messages.map((m) => {
            const mine = m.senderUid === currentUserId;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: mine ? "flex-end" : "flex-start",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #eee",
                    background: mine ? "#f3f3f3" : "#fff",
                    fontSize: 14,
                  }}
                >
                  {!mine ? (
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>{m.senderRole || "user"}</div>
                  ) : null}
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
        />
        <button
          onClick={send}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: "black",
            color: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
