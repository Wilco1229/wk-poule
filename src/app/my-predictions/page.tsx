"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";

type MatchRow = {
  id: number;
  kickoff: string;
  stage: string;
  home_team_id: number;
  away_team_id: number;
};

type TeamRow = { id: number; name: string };

type PredictionRow = {
  match_id: number;
};

type StageBlock = {
  stage: string;
  deadline: Date | null;
  matches: {
    id: number;
    kickoff: string;
    home: string;
    away: string;
    filled: boolean;
  }[];
};

export default function MyPredictionsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);

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

        const [
          { data: teamData, error: teamErr },
          { data: matchData, error: matchErr },
          { data: predData, error: predErr },
        ] = await Promise.all([
          supabase.from("teams").select("id,name"),
          supabase.from("matches").select("id,kickoff,stage,home_team_id,away_team_id"),
          supabase.from("predictions").select("match_id"),
        ]);

        if (teamErr || matchErr || predErr) {
          if (!cancelled)
            setMsg(teamErr?.message || matchErr?.message || predErr?.message || "Fout bij laden.");
          return;
        }

        if (!cancelled) {
          setTeams((teamData ?? []) as TeamRow[]);
          setMatches((matchData ?? []) as MatchRow[]);
          setPredictions((predData ?? []) as PredictionRow[]);
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
    const m = new Map<number, string>();
    teams.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [teams]);

  const filledSet = useMemo(() => {
    return new Set(predictions.map((p) => p.match_id));
  }, [predictions]);

  const stages = useMemo<StageBlock[]>(() => {
    const byStage = new Map<string, MatchRow[]>();
    matches.forEach((m) => {
      const s = (m.stage ?? "").toUpperCase();
      byStage.set(s, [...(byStage.get(s) ?? []), m]);
    });

    const blocks: StageBlock[] = [];

    for (const [stage, ms] of byStage.entries()) {
      const sorted = [...ms].sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
      const deadline = sorted.length ? new Date(sorted[0].kickoff) : null;

      blocks.push({
        stage,
        deadline,
        matches: sorted.map((m) => ({
          id: m.id,
          kickoff: m.kickoff,
          home: teamMap.get(m.home_team_id) ?? "—",
          away: teamMap.get(m.away_team_id) ?? "—",
          filled: filledSet.has(m.id),
        })),
      });
    }

    const order = ["GROUP", "R32", "R16", "QF", "SF", "F"];
    blocks.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));

    return blocks;
  }, [matches, teamMap, filledSet]);

  function stageClosed(deadline: Date | null) {
    if (!deadline) return false;
    return new Date() >= deadline;
  }

  if (loading) {
    return (
      <PageShell maxWidth={980}>
        <Topbar />
        <p style={{ marginTop: 12 }}>Laden…</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth={980}>
      <Topbar />

      <h1 style={{ margin: 0 }}>Mijn voorspellingen</h1>
      <p style={{ color: "#666", marginTop: 8 }}>
        Overzicht per fase. ✅ = ingevuld, ❌ = ontbreekt, 🔒 = fase gesloten.
      </p>

      {msg && <p style={{ color: "crimson", marginTop: 10 }}>Fout: {msg}</p>}

      {stages.map((s) => {
        const closed = stageClosed(s.deadline);
        const filledCount = s.matches.filter((m) => m.filled).length;

        return (
          <div key={s.stage} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>
                {s.stage} {closed && <span title="Gesloten">🔒</span>}
              </h2>

              <Link href={`/predictions/${s.stage}`} style={btnLink}>
                Naar voorspellen
              </Link>
            </div>

            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              {filledCount}/{s.matches.length} ingevuld
              {s.deadline && <> • deadline: {s.deadline.toLocaleString()}</>}
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {s.matches.map((m) => (
                <div key={m.id} style={row}>
                  <div>
                    <b>{m.home}</b> – <b>{m.away}</b>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {new Date(m.kickoff).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800 }}>{m.filled ? "✅" : "❌"}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </PageShell>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 14,
  marginTop: 16,
  background: "#fff",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  border: "1px solid #eee",
  borderRadius: 10,
  padding: 10,
  background: "#fff",
};

const btnLink: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  textDecoration: "none",
  color: "#111",
  background: "#fff",
};