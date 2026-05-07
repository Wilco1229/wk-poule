"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";

type Profile = {
  id: string;
  display_name: string;
  department: string | null;
  gender: string | null;
};

export default function SetupPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [gender, setGender] = useState(""); // man/vrouw/anders of leeg

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setMsg(null);

      try {
        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) {
          if (!cancelled) setMsg(sessErr.message);
          return;
        }

        const user = sessionData.session?.user;
        if (!user) {
          router.replace("/login");
          return;
        }

        if (!cancelled) setUserId(user.id);

        // Bestaand profiel ophalen (als dat er al is)
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, department, gender")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          if (!cancelled) setMsg(error.message);
          return;
        }

        if (data) {
          const p = data as Profile;
          if (!cancelled) {
            setDisplayName(p.display_name ?? "");
            setDepartment(p.department ?? "");
            setGender(p.gender ?? "");
          }
        }
      } catch (e: any) {
        if (!cancelled) setMsg(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function saveProfile() {
    setMsg(null);

    if (!userId) {
      setMsg("Niet ingelogd. Ga naar /login.");
      return;
    }

    const nameTrim = displayName.trim();
    if (nameTrim.length < 2) {
      setMsg("Vul een naam in (minimaal 2 tekens).");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            display_name: nameTrim,
            department: department.trim() || null,
            gender: gender.trim() || null,
          },
          { onConflict: "id" }
        );

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("Profiel opgeslagen ✅");
      setTimeout(() => {
        router.replace("/");
      }, 600);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageShell maxWidth={720}>
        <Topbar />
        <p style={{ marginTop: 12 }}>Laden…</p>
        {msg && <p style={{ color: "crimson" }}>Fout: {msg}</p>}
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth={720}>
      <Topbar />

      <h1>Profiel instellen</h1>
      <p style={{ color: "#555" }}>
        Vul je naam in zoals je in de ranglijst wilt staan. Afdeling en geslacht zijn optioneel.
      </p>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <label style={lbl}>Naam (verplicht)</label>
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Bijv. Wilco van Abkoude"
        style={inp}
      />

      <label style={lbl}>Afdeling (optioneel)</label>
      <input
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        placeholder="Bijv. Planning & Control"
        style={inp}
      />

      <label style={lbl}>Geslacht (optioneel)</label>
      <select value={gender} onChange={(e) => setGender(e.target.value)} style={inp}>
        <option value="">(niet invullen)</option>
        <option value="man">man</option>
        <option value="vrouw">vrouw</option>
        <option value="anders">anders</option>
      </select>

      <button onClick={saveProfile} disabled={saving} style={btnPrimary}>
        {saving ? "Opslaan…" : "Opslaan"}
      </button>
    </PageShell>
  );
}

const lbl: React.CSSProperties = {
  display: "block",
  marginTop: 16,
  marginBottom: 6,
  fontSize: 12,
  color: "#555",
};

const inp: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  marginTop: 18,
  padding: 12,
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};