"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";

type Team = { id: number; name: string };
type Match = {
  id: number;
  kickoff: string;
  stage: string;
  home_team_id: number;
  away_team_id: number;
};

export default function AdminMatchesPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const [stage, setStage] = useState("GROUP");
  const [kickoffLocal, setKickoffLocal] = useState("");
  const [homeTeamId, setHomeTeamId] = useState<number | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

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

      const { data: roleData, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleErr) setMsg(roleErr.message);
      const admin = roleData?.role === "admin";
      setIsAdmin(admin);

      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .select("id,name")
        .order("name", { ascending: true });

      if (teamErr) setMsg(teamErr.message);
      const t = (teamData ?? []) as Team[];
      setTeams(t);

      const { data: matchData, error: matchErr } = await supabase
        .from("matches")
        .select("id,kickoff,stage,home_team_id,away_team_id")
        .order("kickoff", { ascending: true });

      if (matchErr) setMsg(matchErr.message);
      setMatches((matchData ?? []) as Match[]);

      if (t.length >= 2) {
        setHomeTeamId(t[0].id);
        setAwayTeamId(t[1].id);
      }

      setLoading(false);
    }

    init();
  }, []);

  async function reloadMatches() {
    const { data, error } = await supabase
      .from("matches")
      .select("id,kickoff,stage,home_team_id,away_team_id")
      .order("kickoff", { ascending: true });

    if (error) setMsg(error.message);
    setMatches((data ?? []) as Match[]);
  }

  async function createMatch() {
    setMsg(null);

    if (!isAdmin) {
      setMsg("Geen toegang (admin vereist).");
      return;
    }
    if (!kickoffLocal) {
      setMsg("Vul een kickoff datum/tijd in.");
      return;
    }
    if (!homeTeamId || !awayTeamId) {
      setMsg("Kies thuis- en uitteam.");
      return;
    }
    if (homeTeamId === awayTeamId) {
      setMsg("Thuis- en uitteam mogen niet hetzelfde zijn.");
      return;
    }

    const kickoffISO = new Date(kickoffLocal).toISOString();

    setSaving(true);
    const { error } = await supabase.from("matches").insert({
      kickoff: kickoffISO,
      stage: stage.toUpperCase(),
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
    });
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Wedstrijd toegevoegd ✅");
    await reloadMatches();
  }

  async function deleteMatch(matchId: number) {
    setMsg(null);

    if (!isAdmin) {
      setMsg("Geen toegang (admin vereist).");
      return;
    }

    if (!confirm("Weet je zeker dat je deze wedstrijd wilt verwijderen?")) return;

    const { error } = await supabase.from("matches").delete().eq("id", matchId);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Wedstrijd verwijderd ✅");
    await reloadMatches();
  }

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
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif" }}>
      <Topbar />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Admin – Wedstrijden</h1>
        <a href="/admin" style={{ color: "#111" }}>← Admin menu</a>
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <section style={{ marginTop: 18, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Nieuwe wedstrijd toevoegen</h2>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div>
            <div style={lbl}>Fase</div>
            <select value={stage} onChange={(e) => setStage(e.target.value)} style={inp}>
              <option value="GROUP">GROUP</option>
              <option value="R32">R32</option>
              <option value="R16">R16</option>
              <option value="QF">QF</option>
              <option value="SF">SF</option>
              <option value="F">F</option>
            </select>
          </div>

          <div>
            <div style={lbl}>Kickoff</div>
            <input type="datetime-local" value={kickoffLocal} onChange={(e) => setKickoffLocal(e.target.value)} style={inp} />
          </div>

          <div>
            <div style={lbl}>Thuis</div>
            <select value={homeTeamId ?? ""} onChange={(e) => setHomeTeamId(Number(e.target.value))} style={inp}>
              {teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>

          <div>
            <div style={lbl}>Uit</div>
            <select value={awayTeamId ?? ""} onChange={(e) => setAwayTeamId(Number(e.target.value))} style={inp}>
              {teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
        </div>

        <button onClick={createMatch} disabled={saving} style={btn}>
          {saving ? "Toevoegen…" : "Wedstrijd toevoegen"}
        </button>
      </section>

      <section style={{ marginTop: 18 }}>
        <h2>Alle wedstrijden</h2>

        {matches.length === 0 ? (
          <p>Geen wedstrijden gevonden.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {matches.map((m) => (
              <div key={m.id} style={row}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {(teamMap.get(m.home_team_id) ?? m.home_team_id)} – {(teamMap.get(m.away_team_id) ?? m.away_team_id)}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {m.stage} • {new Date(m.kickoff).toLocaleString()}
                  </div>
                </div>

                <button onClick={() => deleteMatch(m.id)} style={btnDanger}>Verwijderen</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, color: "#555", marginBottom: 6 };

const inp: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const btn: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
  color: "crimson",
};

const row: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};