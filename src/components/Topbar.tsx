"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled && !error) setIsAdmin(data?.role === "admin");
    }

    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function linkStyle(href: string): React.CSSProperties {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
    return {
      padding: "8px 10px",
      border: "1px solid #ddd",
      borderRadius: 10,
      textDecoration: "none",
      color: active ? "#fff" : "#111",
      background: active ? "#111" : "#fff",
      fontWeight: active ? 700 : 500,
    };
  }

  return (
    <div style={bar}>
      <div style={left}>
        <Link href="/" style={linkStyle("/")}>Home</Link>
        <Link href="/predictions/GROUP" style={linkStyle("/predictions")}>Voorspellen</Link>
        <Link href="/bonus" style={linkStyle("/bonus")}>Bonus</Link>
        <Link href="/progress" style={linkStyle("/progress")}>Voortgang</Link>
        <Link href="/results" style={linkStyle("/results")}>Uitslagen</Link>
        <Link href="/leaderboard" style={linkStyle("/leaderboard")}>Ranglijst</Link>
        <Link href="/my-predictions" style={linkStyle("/my-predictions")}>Mijn</Link>
        {isAdmin ? <Link href="/admin" style={linkStyle("/admin")}>Admin</Link> : null}
      </div>

      <button onClick={logout} style={btn}>
        Uitloggen
      </button>
    </div>
  );
}

const bar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
  paddingBottom: 12,
  borderBottom: "1px solid #eee",
};

const left: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const btn: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 10,
  background: "#fff",
  cursor: "pointer",
};