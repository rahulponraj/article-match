"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
export function useProfile() {
  const [p, setP] = useState<{ id: string; email: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { window.location.href = "/login"; return; }
      const { data: row } = await supabase.from("profiles").select("id,email,role").eq("id", data.session.user.id).single();
      setP(row); setLoading(false);
    })();
  }, []);
  return { profile: p, loading };
}
