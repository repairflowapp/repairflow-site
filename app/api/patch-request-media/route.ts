import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const { requestId, media } = await req.json();

    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }
    if (!Array.isArray(media)) {
      return NextResponse.json({ error: "media must be an array" }, { status: 400 });
    }

    const ref = doc(db, "roadsideRequests", requestId);

    // append media items
    for (const m of media) {
      if (!m?.url || !m?.type) continue;
      await updateDoc(ref, {
        media: arrayUnion(m),
        updatedAt: serverTimestamp(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
