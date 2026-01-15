import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

export async function uploadAttachment(file: File, path: string) {
const fileRef = ref(storage, path);
await uploadBytes(fileRef, file);
return await getDownloadURL(fileRef);
}
