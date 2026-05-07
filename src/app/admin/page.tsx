"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setMsg(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        setMsg(error.message);
        setIsAdmin(false);
      } else {
        setIsAdmin(data?.role === "admin");
      }

      setLoading(false);
    }

    init();
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 40, fontFamily: "sans-serif" }}>
        <Topbar />
        <p>Laden…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main style={{ padding: 40, fontFamily: "sans-serif" }}>
        <Topbar />
        <h1>Geen toegang</h1>
        <p>Deze pagina is alleen voor admins.</p>
        {msg && <p style={{ color: "crimson" }}>Fout: {msg}</p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif" }}>
      <Topbar />
      <h1>Admin</h1>
      <p>Kies wat je wilt beheren.</p>

      {msg && <p style={{ color: "crimson" }}>Fout: {msg}</p>}

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <a href="/admin/matches" style={card}>
          Wedstrijden beheren
        </a>

        <a href="/admin/results" style={card}>
          Uitslagen invullen
        </a>

        <a href="/admin/bonus-results" style={card}>
          Bonus-uitkomsten invullen
        </a>
      </div>
    </main>
  );
}

const card: React.CSSProperties = {
  display: "block",
  padding: 14,
  borderRadius: 12,
  border: "1px solid #ddd",
  textDecoration: "none",
  color: "#111",
  background: "#fff",
};
