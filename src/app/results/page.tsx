"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";
import TeamLabel from "@/components/TeamLabel";

type TeamRow = { id: number; name: string; country_code: string | null };

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

type PredictionRow = {
  match_id: number;
  home_goals: number;
  away_goals: number;
};

type StageFilter = "ALL" | string;

function calcPoints(predHome: number, predAway: number, resHome: number, resAway: number): number {
  // 1) exact goed
  if (predHome === resHome && predAway === resAway) return 200;

  const predDiff = predHome - predAway;
  const resDiff = resHome - resAway;

  // 2) gelijkspel goed (score niet exact)
  if (predDiff === 0 && resDiff === 0) return 100;

  const winnerCorrect = (predDiff > 0 && resDiff > 0) || (predDiff < 0 && resDiff < 0);
  const oneTeamGoalsCorrect = predHome === resHome || predAway === resAway;

  // 3) winnaar goed + goals van 1 team goed
  if (winnerCorrect && oneTeamGoalsCorrect) return 95;

  // 4) winnaar goed
  if (winnerCorrect) return 75;

  // 5) goals van 1 team goed
  if (oneTeamGoalsCorrect) return 20;

  return 0;
}

export default function ResultsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);

  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [onlyWithResult, setOnlyWithResult] = useState(true);

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

        const [teamRes, matchRes, resultRes, predRes] = await Promise.all([
          supabase.from("teams").select("id,name,country_code").order("name"),
          supabase
            .from("matches")
            .select("id,kickoff,stage,home_team_id,away_team_id")
            .order("kickoff", { ascending: false }),
          supabase.from("results").select("match_id,home_goals,away_goals"),
          // RLS zorgt dat je alleen je eigen predictions ziet
          supabase.from("predictions").select("match_id,home_goals,away_goals"),
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
        if (predRes.error) {
          if (!cancelled) setMsg(predRes.error.message);
          return;
        }

        if (!cancelled) {
          setTeams((teamRes.data ?? []) as TeamRow[]);
          setMatches((matchRes.data ?? []) as MatchRow[]);
          setResults((resultRes.data ?? []) as ResultRow[]);
          setPredictions((predRes.data ?? []) as PredictionRow[]);
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

  const teamMap = useMemo(() => {
    const m = new Map<number, { name: string; countryCode: string | null }>();
    for (const t of teams) m.set(t.id, { name: t.name, countryCode: t.country_code });
    return m;
  }, [teams]);

  const resultMap = useMemo(() => {
    const m = new Map<number, ResultRow>();
    for (const r of results) m.set(r.match_id, r);
    return m;
  }, [results]);

  const predMap = useMemo(() => {
    const m = new Map<number, PredictionRow>();
    for (const p of predictions) m.set(p.match_id, p);
    return m;
  }, [predictions]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) set.add((m.stage ?? "").toUpperCase());
    const arr = Array.from(set);
    const order = ["GROUP", "R32", "R16", "QF", "SF", "F"];
    arr.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return arr;
  }, [matches]);

  const rows = useMemo(() => {
    const filtered = matches.filter((m) => {
      const st = (m.stage ?? "").toUpperCase();
      if (stageFilter !== "ALL" && st !== stageFilter) return false;
      if (onlyWithResult && !resultMap.has(m.id)) return false;
      return true;
    });

    return filtered.map((m) => {
      const res = resultMap.get(m.id) ?? null;
      const pred = predMap.get(m.id) ?? null;

      const home = teamMap.get(m.home_team_id) ?? { name: "—", countryCode: null };
      const away = teamMap.get(m.away_team_id) ?? { name: "—", countryCode: null };

      let points: number | null = null;
      if (res && pred) {
        points = calcPoints(pred.home_goals, pred.away_goals, res.home_goals, res.away_goals);
      } else if (res && !pred) {
        points = 0; // uitslag is er, maar jij hebt niets ingevuld
      }

      return { match: m, home, away, res, pred, points };
    });
  }, [matches, stageFilter, onlyWithResult, resultMap, predMap, teamMap]);

  const totals = useMemo(() => {
    const done = rows.filter((r) => r.res !== null);
    const withPred = done.filter((r) => r.pred !== null);
    const totalPoints = rows.reduce((sum, r) => sum + (r.points ?? 0), 0);
    return {
      totalPoints,
      doneCount: done.length,
      withPredCount: withPred.length,
      totalCount: rows.length,
    };
  }, [rows]);

  function pointsColor(p: number | null) {
    if (p === null) return "#6b7280";
    if (p >= 100) return "#0a7a2f";
    if (p >= 75) return "#0a7a2f";
    if (p >= 20) return "#92400e";
    return "#111827";
  }

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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Uitslagen & mijn punten</h1>
          <p style={{ marginTop: 6, color: "#6b7280" }}>
            Per wedstrijd: uitslag, jouw voorspelling en je punten.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={lbl}>Fase</div>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={selectStyle}>
              <option value="ALL">Alle fases</option>
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
            <input type="checkbox" checked={onlyWithResult} onChange={(e) => setOnlyWithResult(e.target.checked)} />
            Alleen met uitslag
          </label>
        </div>
      </div>

      {msg && (
        <div style={errorBox}>
          <b>Fout:</b> {msg}
        </div>
      )}

      <div style={statsRow}>
        <div style={statCard}>
          <div style={statLabel}>Totaal punten (in huidige filter)</div>
          <div style={statValue}>{totals.totalPoints}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Wedstrijden met uitslag</div>
          <div style={statValue}>{totals.doneCount}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Met jouw voorspelling</div>
          <div style={statValue}>{totals.withPredCount}</div>
        </div>
      </div>

      <div style={tableWrap}>
        <div style={thead}>
          <div>Datum</div>
          <div>Wedstrijd</div>
          <div style={{ textAlign: "right" }}>Uitslag</div>
          <div style={{ textAlign: "right" }}>Jij</div>
          <div style={{ textAlign: "right" }}>Punten</div>
        </div>

        {rows.map((r) => (
          <div key={r.match.id} style={trow}>
            <div style={{ color: "#374151", fontSize: 13 }}>
              {new Date(r.match.kickoff).toLocaleString()}
              <div style={{ fontSize: 12, color: "#6b7280" }}>{(r.match.stage ?? "").toUpperCase()}</div>
            </div>

            <div style={{ fontWeight: 700, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <TeamLabel name={r.home.name} countryCode={r.home.countryCode} />
              <span>–</span>
              <TeamLabel name={r.away.name} countryCode={r.away.countryCode} />
            </div>

            <div style={{ textAlign: "right", fontWeight: 700 }}>
              {r.res ? `${r.res.home_goals} - ${r.res.away_goals}` : "—"}
            </div>

            <div style={{ textAlign: "right", color: "#111827" }}>
              {r.pred ? `${r.pred.home_goals} - ${r.pred.away_goals}` : "—"}
            </div>

            <div style={{ textAlign: "right", fontWeight: 900, color: pointsColor(r.points) }}>
              {r.points === null ? "—" : r.points}
            </div>
          </div>
        ))}

        {rows.length === 0 && <div style={{ padding: 12, color: "#6b7280" }}>Geen wedstrijden binnen dit filter.</div>}
      </div>

      <p style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
        Let op: punten worden berekend volgens jouw regels (200/100/95/75/20/0). Als er geen voorspelling is, tonen we
        0 bij wedstrijden met uitslag.
      </p>
    </PageShell>
  );
}

/* ===== styles ===== */

const lbl: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 6,
};

const selectStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f3b5b5",
  background: "#fff0f0",
  color: "#8a0000",
};

const statsRow: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const statCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  background: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const statValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 20,
  fontWeight: 900,
  color: "#111827",
};

const tableWrap: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const thead: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "190px 1fr 120px 120px 110px",
  background: "#f7f7f7",
  padding: 12,
  fontWeight: 800,
  fontSize: 13,
  color: "#111827",
};

const trow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "190px 1fr 120px 120px 110px",
  padding: 12,
  borderTop: "1px solid #eee",
  alignItems: "center",
};