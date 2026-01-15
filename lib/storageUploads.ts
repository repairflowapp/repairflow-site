import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

export type UploadKind = "customer" | "provider";

export type UploadedMedia = {
  path: string;
  url: string;
  contentType: string;
  size: number;
  originalName: string;
};

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "video/"];

export function validateMediaFile(file: File) {
  if (file.size > MAX_BYTES) {
    throw new Error("File too large. Max 25MB per file.");
  }
  const ok = ALLOWED_PREFIXES.some((p) => file.type.startsWith(p));
  if (!ok) {
    throw new Error("Only images and videos are allowed.");
  }
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export async function uploadRequestMedia(opts: {
  requestId: string;
  kind: UploadKind;
  files: File[];
}): Promise<UploadedMedia[]> {
  const { requestId, kind, files } = opts;

  const uploads: UploadedMedia[] = [];
  for (const file of files) {
    validateMediaFile(file);

    const id = crypto.randomUUID();
    const path = `requests/${requestId}/${kind}/${id}_${safeName(file.name)}`;

    const r = ref(storage, path);
    await uploadBytes(r, file, { contentType: file.type });

    const url = await getDownloadURL(r);
    uploads.push({
      path,
      url,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
    });
  }

  return uploads;
}
