"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";
import TeamLabel from "@/components/TeamLabel";

type TeamRow = {
  id: number;
  name: string;
  group_code: string | null;
  country_code: string | null;
};

type MatchRow = {
  id: number;
  kickoff: string;
  stage: string;
  home_team_id: number;
  away_team_id: number;
};

type ResultRow = {
  match_id: number;
  home_goals: number;
  away_goals: number;
};

type TeamStanding = {
  team_id: number;
  name: string;
  country_code: string | null;

  played: number;
  wins: number;
  draws: number;
  losses: number;

  gf: number;
  ga: number;
  gd: number;

  pts: number;
};

type GroupBlock = {
  group_code: string;
  teams: TeamStanding[];
  playedMatches: number;
  totalMatches: number;
};

const GROUPS = Array.from("ABCDEFGHIJKL"); // A t/m L

export default function ProgressPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);

  const [onlyGroupsWithTeams, setOnlyGroupsWithTeams] = useState(true);
  const [onlyPlayedTeams, setOnlyPlayedTeams] = useState(false);

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
        if (!sessionData.session?.user) {
          router.replace("/login");
          return;
        }

        const [teamRes, matchRes, resultRes] = await Promise.all([
          supabase
            .from("teams")
            .select("id,name,group_code,country_code")
            .order("name"),
          supabase
            .from("matches")
            .select("id,kickoff,stage,home_team_id,away_team_id")
            .eq("stage", "GROUP")
            .order("kickoff", { ascending: true }),
          supabase.from("results").select("match_id,home_goals,away_goals"),
        ]);

        if (teamRes.error) {
          if (!cancelled) setMsg(teamRes.error.message);
          return;
        }
        if (matchRes.error) {
          if (!cancelled) setMsg(matchRes.error.message);
          return;
        }
        if (resultRes.error) {
          if (!cancelled) setMsg(resultRes.error.message);
          return;
        }

        if (!cancelled) {
          setTeams((teamRes.data ?? []) as TeamRow[]);
          setMatches((matchRes.data ?? []) as MatchRow[]);
          setResults((resultRes.data ?? []) as ResultRow[]);
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

  const teamById = useMemo(() => {
    const m = new Map<number, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const resultByMatchId = useMemo(() => {
    const m = new Map<number, ResultRow>();
    for (const r of results) m.set(r.match_id, r);
    return m;
  }, [results]);

  function newStanding(team: TeamRow): TeamStanding {
    return {
      team_id: team.id,
      name: team.name,
      country_code: team.country_code ?? null,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0,
    };
  }

  const groups = useMemo<GroupBlock[]>(() => {
    const teamsInGroup = new Map<string, TeamRow[]>();
    for (const g of GROUPS) teamsInGroup.set(g, []);

    for (const t of teams) {
      const g = (t.group_code ?? "").toUpperCase();
      if (g && teamsInGroup.has(g)) teamsInGroup.get(g)!.push(t);
    }

    const blocks: GroupBlock[] = [];

    for (const g of GROUPS) {
      const tList = teamsInGroup.get(g) ?? [];
      const st = new Map<number, TeamStanding>();
      for (const t of tList) st.set(t.id, newStanding(t));

      const groupMatchRows = matches.filter((m) => {
        const ht = teamById.get(m.home_team_id);
        const at = teamById.get(m.away_team_id);
        if (!ht || !at) return false;
        return (ht.group_code ?? "").toUpperCase() === g && (at.group_code ?? "").toUpperCase() === g;
      });

      const totalMatches = groupMatchRows.length;
      let playedMatches = 0;

      function applyResult(homeId: number, awayId: number, hg: number, ag: number) {
        const home = st.get(homeId);
        const away = st.get(awayId);
        if (!home || !away) return;

        home.played += 1;
        away.played += 1;

        home.gf += hg;
        home.ga += ag;

        away.gf += ag;
        away.ga += hg;

        if (hg > ag) {
          home.wins += 1;
          away.losses += 1;
          home.pts += 3;
        } else if (hg < ag) {
          away.wins += 1;
          home.losses += 1;
          away.pts += 3;
        } else {
          home.draws += 1;
          away.draws += 1;
          home.pts += 1;
          away.pts += 1;
        }

        home.gd = home.gf - home.ga;
        away.gd = away.gf - away.ga;
      }

      for (const m of groupMatchRows) {
        const r = resultByMatchId.get(m.id);
        if (!r) continue;
        playedMatches += 1;
        applyResult(m.home_team_id, m.away_team_id, r.home_goals, r.away_goals);
      }

      let standingList = Array.from(st.values()).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.name.localeCompare(b.name);
      });

      if (onlyPlayedTeams) {
        standingList = standingList.filter((t) => t.played > 0);
      }

      blocks.push({
        group_code: g,
        teams: standingList,
        playedMatches,
        totalMatches,
      });
    }

    return onlyGroupsWithTeams
      ? blocks.filter((b) => (teamsInGroup.get(b.group_code)?.length ?? 0) > 0)
      : blocks;
  }, [teams, matches, teamById, resultByMatchId, onlyGroupsWithTeams, onlyPlayedTeams]);

  if (loading) {
    return (
      <PageShell maxWidth={1100}>
        <Topbar />
        <p style={{ marginTop: 12 }}>Laden…</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth={1100}>
      <Topbar />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>WK voortgang – Groepsstanden</h1>
          <p style={{ marginTop: 6, color: "#6b7280" }}>
            Alleen wedstrijden met een ingevulde uitslag tellen mee in de stand.
          </p>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <label style={toggle}>
            <input
              type="checkbox"
              checked={onlyGroupsWithTeams}
              onChange={(e) => setOnlyGroupsWithTeams(e.target.checked)}
            />
            Alleen groepen met teams
          </label>

          <label style={toggle}>
            <input
              type="checkbox"
              checked={onlyPlayedTeams}
              onChange={(e) => setOnlyPlayedTeams(e.target.checked)}
            />
            Alleen teams met gespeelde wedstrijd
          </label>
        </div>
      </div>

      {msg && (
        <div style={errorBox}>
          <b>Fout:</b> {msg}
        </div>
      )}

      {groups.length === 0 ? (
        <div style={emptyBox}>
          Nog geen groepsdata. Check teams.group_code en of er GROUP-wedstrijden zijn ingevoerd.
        </div>
      ) : (
        <div style={grid}>
          {groups.map((g) => (
            <div key={g.group_code} style={groupCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <h2 style={{ margin: 0 }}>Groep {g.group_code}</h2>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  gespeeld: <b>{g.playedMatches}</b> / {g.totalMatches}
                </div>
              </div>

              <div style={tableWrap}>
                <div style={thead}>
                  <div>Team</div>
                  <div style={{ textAlign: "right" }}>GS</div>
                  <div style={{ textAlign: "right" }}>W</div>
                  <div style={{ textAlign: "right" }}>G</div>
                  <div style={{ textAlign: "right" }}>V</div>
                  <div style={{ textAlign: "right" }}>DV</div>
                  <div style={{ textAlign: "right" }}>DT</div>
                  <div style={{ textAlign: "right" }}>DS</div>
                  <div style={{ textAlign: "right" }}>Ptn</div>
                </div>

                {g.teams.map((t) => (
                  <div key={t.team_id} style={trow}>
                    <div style={{ fontWeight: 700 }}>
                      <TeamLabel name={t.name} countryCode={t.country_code} />
                    </div>
                    <div style={{ textAlign: "right" }}>{t.played}</div>
                    <div style={{ textAlign: "right" }}>{t.wins}</div>
                    <div style={{ textAlign: "right" }}>{t.draws}</div>
                    <div style={{ textAlign: "right" }}>{t.losses}</div>
                    <div style={{ textAlign: "right" }}>{t.gf}</div>
                    <div style={{ textAlign: "right" }}>{t.ga}</div>
                    <div style={{ textAlign: "right" }}>{t.gd}</div>
                    <div style={{ textAlign: "right", fontWeight: 900 }}>{t.pts}</div>
                  </div>
                ))}

                {g.teams.length === 0 && (
                  <div style={{ padding: 12, color: "#6b7280" }}>
                    Geen teams om te tonen (filter aan of groep leeg).
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
        Sortering: punten ↓, doelsaldo ↓, goals voor ↓, naam ↑.
      </p>
    </PageShell>
  );
}

/* ===== styles ===== */

const grid: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
  gap: 14,
};

const groupCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const tableWrap: React.CSSProperties = {
  marginTop: 12,
  border: "1px solid #ddd",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const thead: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 48px 40px 40px 40px 48px 48px 48px 52px",
  background: "#f7f7f7",
  padding: 10,
  fontWeight: 800,
  fontSize: 12,
  color: "#111827",
};

const trow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 48px 40px 40px 40px 48px 48px 48px 52px",
  padding: 10,
  borderTop: "1px solid #eee",
  alignItems: "center",
  fontSize: 13,
};

const toggle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#111827",
  userSelect: "none",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f3b5b5",
  background: "#fff0f0",
  color: "#8a0000",
};

const emptyBox: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#6b7280",
};