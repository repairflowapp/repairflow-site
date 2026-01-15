import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { getStorage } from "firebase/storage";

/**
* Uploads a file to Firebase Storage and returns a public URL
* @param file File object from input
* @param path Storage path (ex: roadsideRequests/{id}/attachments/file.jpg)
*/
export const storage = getStorage(app);
export async function uploadAttachment(file: File, path: string) {
const fileRef = ref(storage, path);
await uploadBytes(fileRef, file);
return await getDownloadURL(fileRef);
}
