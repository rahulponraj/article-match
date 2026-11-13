import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
export const ASSET = process.env.NEXT_PUBLIC_ASSET_DOMAIN || "https://api.joggerco.cloud";
export const imgUrl = (p: string) => (p?.startsWith("http") ? p : ASSET + p);

export async function authFetch(url: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${data.session?.access_token}` };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json();
}

// Vercel rejects bodies over ~4.5 MB, so shrink phone photos before upload.
export function shrink(file: Blob, max = 1280): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read image"))), "image/jpeg", 0.88);
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = URL.createObjectURL(file);
  });
}
export const b64ToBlob = async (b64: string) => (await fetch(`data:image/png;base64,${b64}`)).blob();
