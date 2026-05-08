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

type PublicRow = {
  display_name: string;
  department: string;
  pred_home: number;
  pred_away: number;
  points: number;
};

function calcPoints(predHome: number, predAway: number, resHome: number, resAway: number): number {
  if (predHome === resHome && predAway === resAway) return 200;

  const predDiff = predHome - predAway;
  const resDiff = resHome - resAway;

  if (predDiff === 0 && resDiff === 0) return 100;

  const winnerCorrect = (predDiff > 0 && resDiff > 0) || (predDiff < 0 && resDiff < 0);
  const oneTeamGoalsCorrect = predHome === resHome || predAway === resAway;

  if (winnerCorrect && oneTeamGoalsCorrect) return 95;
  if (winnerCorrect) return 75;
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

  // Modal state: iedereen + punten voor deze match
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [modalRows, setModalRows] = useState<PublicRow[]>([]);
  const [modalTitle, setModalTitle] = useState<string>("");

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

        const [teamRes, matchRes, resultRes, predRes] = await Promise.all([
          supabase.from("teams").select("id,name,country_code").order("name"),
          supabase
            .from("matches")
            .select("id,kickoff,stage,home_team_id,away_team_id")
            .order("kickoff", { ascending: false }),
          supabase.from("results").select("match_id,home_goals,away_goals"),
          supabase.from("predictions").select("match_id,home_goals,away_goals"),
        ]);

        if (teamRes.error) { if (!cancelled) setMsg(teamRes.error.message); return; }
        if (matchRes.error) { if (!cancelled) setMsg(matchRes.error.message); return; }
        if (resultRes.error) { if (!cancelled) setMsg(resultRes.error.message); return; }
        if (predRes.error) { if (!cancelled) setMsg(predRes.error.message); return; }

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
    return () => { cancelled = true; };
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

  function started(kickoffIso: string) {
    return Date.now() >= new Date(kickoffIso).getTime();
  }

  async function openEveryoneForMatch(m: MatchRow) {
    const res = resultMap.get(m.id);
    if (!res) return; // alleen als uitslag bestaat
    if (!started(m.kickoff)) return; // alleen na kickoff

    const home = teamMap.get(m.home_team_id) ?? { name: "—", countryCode: null };
    const away = teamMap.get(m.away_team_id) ?? { name: "—", countryCode: null };

    setModalOpen(true);
    setModalLoading(true);
    setModalErr(null);
    setModalRows([]);

    setModalTitle(`${home.name} – ${away.name} (${res.home_goals}-${res.away_goals})`);

    try {
      const { data, error } = await supabase.rpc("get_match_predictions_with_points", {
        p_match_id: m.id,
      });

      if (error) {
        setModalErr(error.message);
        return;
      }

      setModalRows((data ?? []) as PublicRow[]);
    } finally {
      setModalLoading(false);
    }
  }

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
      if (res && pred) points = calcPoints(pred.home_goals, pred.away_goals, res.home_goals, res.away_goals);
      else if (res && !pred) points = 0;

      const clickable = !!res && started(m.kickoff);

      return { match: m, home, away, res, pred, points, clickable };
    });
  }, [matches, stageFilter, onlyWithResult, resultMap, predMap, teamMap]);

  const totals = useMemo(() => {
    const done = rows.filter((r) => r.res !== null);
    const withPred = done.filter((r) => r.pred !== null);
    const totalPoints = rows.reduce((sum, r) => sum + (r.points ?? 0), 0);

    return { totalPoints, doneCount: done.length, withPredCount: withPred.length, totalCount: rows.length };
  }, [rows]);

  function pointsColor(p: number | null) {
    if (p === null) return "#6b7280";
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Uitslagen & mijn punten</h1>
          <p style={{ marginTop: 6, color: "#6b7280" }}>
            Klik op een wedstrijd (na kickoff) om voorspellingen van iedereen + punten te zien.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={lbl}>Fase</div>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={selectStyle}>
              <option value="ALL">Alle fases</option>
              {stageOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
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
          <div
            key={r.match.id}
            style={{
              ...trow,
              cursor: r.clickable ? "pointer" : "default",
              background: r.clickable ? "#fff" : "#fff",
            }}
            onClick={() => (r.clickable ? openEveryoneForMatch(r.match) : null)}
            title={r.clickable ? "Klik voor alle voorspellingen + punten" : "Pas klikbaar na kickoff en met uitslag"}
          >
            <div style={{ color: "#374151", fontSize: 13 }}>
              {new Date(r.match.kickoff).toLocaleString()}
              <div style={{ fontSize: 12, color: "#6b7280" }}>{(r.match.stage ?? "").toUpperCase()}</div>
            </div>

            <div style={{ fontWeight: 700, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <TeamLabel name={r.home.name} countryCode={r.home.countryCode} />
              <span>–</span>
              <TeamLabel name={r.away.name} countryCode={r.away.countryCode} />
              {r.clickable ? <span style={pill}>👀 iedereen</span> : null}
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

        {rows.length === 0 && (
          <div style={{ padding: 12, color: "#6b7280" }}>Geen wedstrijden binnen dit filter.</div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div style={overlay} onClick={() => setModalOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <h2 style={{ margin: 0 }}>{modalTitle}</h2>
              <button style={closeBtn} onClick={() => setModalOpen(false)}>
                Sluiten
              </button>
            </div>

            {modalLoading && <p style={{ marginTop: 12 }}>Laden…</p>}
            {modalErr && <p style={{ marginTop: 12, color: "crimson" }}>Fout: {modalErr}</p>}

            {!modalLoading && !modalErr && (
              <div style={{ marginTop: 12 }}>
                <div style={listWrap}>
                  <div style={listHead}>
                    <div>Speler</div>
                    <div style={{ textAlign: "right" }}>Voorspelling</div>
                    <div style={{ textAlign: "right" }}>Punten</div>
                  </div>

                  {modalRows.map((r, idx) => (
                    <div key={idx} style={listRow}>
                      <div>
                        <b>{r.display_name}</b>
                        {r.department ? <span style={{ color: "#6b7280" }}> ({r.department})</span> : null}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 800 }}>
                        {r.pred_home} - {r.pred_away}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>
                        {r.points}
                      </div>
                    </div>
                  ))}

                  {modalRows.length === 0 && (
                    <div style={{ padding: 12, color: "#6b7280" }}>
                      Nog geen voorspellingen gevonden voor deze wedstrijd.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

/* styles */
const lbl: React.CSSProperties = { fontSize: 12, color: "#6b7280", marginBottom: 6 };

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

const statLabel: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
const statValue: React.CSSProperties = { marginTop: 6, fontSize: 20, fontWeight: 900, color: "#111827" };

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

const pill: React.CSSProperties = {
  marginLeft: 8,
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

const modal: React.CSSProperties = {
  width: "min(820px, 100%)",
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
};

const closeBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
};

const listWrap: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  overflow: "hidden",
};

const listHead: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 140px 90px",
  background: "#f7f7f7",
  padding: 10,
  fontWeight: 800,
  fontSize: 13,
};

const listRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 140px 90px",
  padding: 10,
  borderTop: "1px solid #eee",
  alignItems: "center",
};