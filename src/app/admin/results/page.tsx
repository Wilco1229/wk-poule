"use client";import { useEffect, useMemo, useState } from "react";
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

type ExistingResult = {
  match_id: number;
  home_goals: number;
  away_goals: number;
};

type Draft = { home: string; away: string };

export default function AdminResultsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stage, setStage] = useState("GROUP");

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
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

      if (roleErr) {
        setMsg(roleErr.message);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const admin = roleData?.role === "admin";
      setIsAdmin(admin);

      // Teams laden (alleen lezen)
      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .select("id,name")
        .order("name", { ascending: true });

      if (teamErr) setMsg(teamErr.message);
      setTeams((teamData ?? []) as Team[]);

      // Eerste load voor default stage
      await loadForStage(stage);

      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadForStage(stageValue: string) {
    setMsg(null);

    // Matches van stage
    const { data: matchData, error: matchErr } = await supabase
      .from("matches")
      .select("id,kickoff,stage,home_team_id,away_team_id")
      .eq("stage", stageValue)
      .order("kickoff", { ascending: true });

    if (matchErr) {
      setMsg(matchErr.message);
      setMatches([]);
      setDrafts({});
      return;
    }

    const ms = (matchData ?? []) as Match[];
    setMatches(ms);

    const ids = ms.map((m) => m.id);
    if (ids.length === 0) {
      setDrafts({});
      return;
    }

    // Bestaande resultaten
    const { data: resData, error: resErr } = await supabase
      .from("results")
      .select("match_id,home_goals,away_goals")
      .in("match_id", ids);

    if (resErr) {
      setMsg(resErr.message);
      setDrafts({});
      return;
    }

    const existing = (resData ?? []) as ExistingResult[];
    const initDrafts: Record<number, Draft> = {};

    ms.forEach((m) => {
      const r = existing.find((e) => e.match_id === m.id);
      initDrafts[m.id] = {
        home: r ? String(r.home_goals) : "",
        away: r ? String(r.away_goals) : "",
      };
    });

    setDrafts(initDrafts);
  }

  // ✅ Correcte setter: update onder drafts[matchId] en zet home/away
  function setDraft(matchId: number, side: "home" | "away", value: string) {
    setDrafts((prev) => ({
      ...prev,
      [matchId]: { ...(prev[matchId] ?? { home: "", away: "" }), [side]: value },
    }));
  }

  async function saveAll() {
    setMsg(null);

    if (!isAdmin) {
      setMsg("Geen toegang (admin vereist).");
      return;
    }

    const rows = matches
      .map((m) => {
        const d = drafts[m.id];
        const h = d?.home?.trim();
        const a = d?.away?.trim();
        if (!h || !a) return null;

        const hg = Number(h);
        const ag = Number(a);
        if (!Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) return null;

        return { match_id: m.id, home_goals: hg, away_goals: ag };
      })
      .filter(Boolean) as Array<{ match_id: number; home_goals: number; away_goals: number }>;

    if (rows.length === 0) {
      setMsg("Geen geldige uitslagen om op te slaan (vul per match beide scores in).");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("results").upsert(rows, { onConflict: "match_id" });
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg(`Uitslagen opgeslagen ✅ (${rows.length})`);
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
        <h1>Admin – Uitslagen</h1>
        <a href="/admin" style={{ color: "#111", textDecoration: "none" }}>
          ← Admin menu
        </a>
      </div>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>Fase</div>
          <select
            value={stage}
            onChange={async (e) => {
              const s = e.target.value;
              setStage(s);
              await loadForStage(s);
            }}
            style={selectStyle}
          >
            <option value="GROUP">GROUP</option>
            <option value="R32">R32</option>
            <option value="R16">R16</option>
            <option value="QF">QF</option>
            <option value="SF">SF</option>
            <option value="F">F</option>
          </select>
        </div>

        <button onClick={saveAll} disabled={saving} style={btnPrimary}>
          {saving ? "Opslaan…" : "Alles opslaan"}
        </button>
      </div>

      {matches.length === 0 ? (
        <p style={{ marginTop: 20 }}>Geen wedstrijden in {stage}. Voeg ze toe via /admin/matches.</p>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          {matches.map((m) => {
            const d = drafts[m.id] ?? { home: "", away: "" };
            return (
              <div key={m.id} style={row}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {(teamMap.get(m.home_team_id) ?? m.home_team_id)} –{" "}
                    {(teamMap.get(m.away_team_id) ?? m.away_team_id)}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>{new Date(m.kickoff).toLocaleString()}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={d.home}
                    onChange={(e) => setDraft(m.id, "home", e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    style={scoreInput}
                  />
                  <span>-</span>
                  <input
                    value={d.away}
                    onChange={(e) => setDraft(m.id, "away", e.target.value)}
                    placeholder="0"
                    inputMode="numeric"
                    style={scoreInput}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

const selectStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
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

const scoreInput: React.CSSProperties = {
  width: 60,
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
  textAlign: "center",
};

