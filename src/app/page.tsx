"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";

type Profile = {
  id: string;
  display_name: string;
  department: string | null;
};

type MatchLite = {
  id: number;
  kickoff: string;
  stage: string;
};

type PredictionLite = {
  match_id: number;
};

type BonusQuestionLite = { id: number };
type BonusAnswerLite = { question_id: number };

type StageStats = {
  stage: string;
  deadline: Date | null;
  totalMatches: number;
  filledMatches: number;
  remainingMatches: number;
  closed: boolean;
};

export default function HomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [matches, setMatches] = useState<MatchLite[]>([]);
  const [predictions, setPredictions] = useState<PredictionLite[]>([]);
  const [bonusQuestions, setBonusQuestions] = useState<BonusQuestionLite[]>([]);
  const [bonusAnswers, setBonusAnswers] = useState<BonusAnswerLite[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) {
          if (!cancelled) setError(sessErr.message);
          return;
        }

        const user = sessionData.session?.user;
        if (!user) {
          router.replace("/login");
          return;
        }

        const [profRes, matchesRes, predsRes, bqRes, baRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id,display_name,department")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("matches")
            .select("id,kickoff,stage")
            .order("kickoff", { ascending: true }),
          supabase.from("predictions").select("match_id"),
          supabase.from("bonus_questions").select("id"),
          supabase.from("bonus_answers").select("question_id"),
        ]);

        if (profRes.error) {
          if (!cancelled) setError(profRes.error.message);
          return;
        }
        if (!profRes.data) {
          router.replace("/setup");
          return;
        }

        if (matchesRes.error) {
          if (!cancelled) setError(matchesRes.error.message);
          return;
        }
        if (predsRes.error) {
          if (!cancelled) setError(predsRes.error.message);
          return;
        }
        if (bqRes.error) {
          if (!cancelled) setError(bqRes.error.message);
          return;
        }
        if (baRes.error) {
          if (!cancelled) setError(baRes.error.message);
          return;
        }

        if (!cancelled) {
          setProfile(profRes.data as Profile);
          setMatches((matchesRes.data ?? []) as MatchLite[]);
          setPredictions((predsRes.data ?? []) as PredictionLite[]);
          setBonusQuestions((bqRes.data ?? []) as BonusQuestionLite[]);
          setBonusAnswers((baRes.data ?? []) as BonusAnswerLite[]);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const predictionSet = useMemo(() => new Set(predictions.map((p) => p.match_id)), [predictions]);

  const stageStats = useMemo<StageStats[]>(() => {
    const now = new Date();

    const byStage = new Map<string, MatchLite[]>();
    for (const m of matches) {
      const s = (m.stage ?? "").toUpperCase();
      if (!byStage.has(s)) byStage.set(s, []);
      byStage.get(s)!.push(m);
    }

    const order = ["GROUP", "R32", "R16", "QF", "SF", "F"];
    const stats: StageStats[] = [];

    for (const [stage, ms] of byStage.entries()) {
      const sorted = [...ms].sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
      const deadline = sorted.length ? new Date(sorted[0].kickoff) : null;

      let filled = 0;
      for (const m of ms) if (predictionSet.has(m.id)) filled++;

      const total = ms.length;
      const remaining = Math.max(0, total - filled);
      const closed = deadline ? now >= deadline : false;

      stats.push({ stage, deadline, totalMatches: total, filledMatches: filled, remainingMatches: remaining, closed });
    }

    stats.sort((a, b) => {
      const ai = order.indexOf(a.stage);
      const bi = order.indexOf(b.stage);
      if (ai === -1 && bi === -1) return a.stage.localeCompare(b.stage);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return stats;
  }, [matches, predictionSet]);

  const nextStageDeadline = useMemo(() => {
    const now = new Date();
    const openDeadlines = stageStats
      .filter((s) => s.deadline && now < s.deadline)
      .sort((a, b) => +a.deadline! - +b.deadline!);
    return openDeadlines.length ? openDeadlines[0] : null;
  }, [stageStats]);

  const openPredictionRemainingTotal = useMemo(() => {
    return stageStats.filter((s) => !s.closed).reduce((sum, s) => sum + s.remainingMatches, 0);
  }, [stageStats]);

  const nextOpenStageWithWork = useMemo(() => {
    const now = new Date();
    const candidates = stageStats
      .filter((s) => s.deadline && now < s.deadline && s.remainingMatches > 0)
      .sort((a, b) => +a.deadline! - +b.deadline!);
    return candidates.length ? candidates[0] : null;
  }, [stageStats]);

  const groupDeadline = useMemo(() => {
    const g = stageStats.find((s) => s.stage === "GROUP");
    return g?.deadline ?? null;
  }, [stageStats]);

  const bonusAnsweredCount = useMemo(() => new Set(bonusAnswers.map((a) => a.question_id)).size, [bonusAnswers]);
  const bonusTotal = bonusQuestions.length;
  const bonusClosed = useMemo(() => (groupDeadline ? new Date() >= groupDeadline : false), [groupDeadline]);

  const voorspellenBadge = useMemo(() => {
    if (matches.length === 0) return { text: "geen wedstrijden", tone: "neutral" as const };
    if (openPredictionRemainingTotal === 0) return { text: "✅ compleet", tone: "ok" as const };
    if (nextOpenStageWithWork) return { text: `${nextOpenStageWithWork.stage}: ${nextOpenStageWithWork.remainingMatches} open`, tone: "warn" as const };
    return { text: `${openPredictionRemainingTotal} open`, tone: "warn" as const };
  }, [matches.length, openPredictionRemainingTotal, nextOpenStageWithWork]);

  const mijnBadge = useMemo(() => {
    if (matches.length === 0) return { text: "—", tone: "neutral" as const };
    if (openPredictionRemainingTotal === 0) return { text: "✅ alles ingevuld", tone: "ok" as const };
    return { text: `${openPredictionRemainingTotal} open`, tone: "warn" as const };
  }, [matches.length, openPredictionRemainingTotal]);

  const bonusBadge = useMemo(() => {
    if (!bonusTotal) return { text: "—", tone: "neutral" as const };
    if (bonusClosed) return { text: `🔒 ${bonusAnsweredCount}/${bonusTotal}`, tone: "closed" as const };
    return {
      text: `${bonusAnsweredCount}/${bonusTotal}`,
      tone: bonusAnsweredCount === bonusTotal ? ("ok" as const) : ("warn" as const),
    };
  }, [bonusAnsweredCount, bonusTotal, bonusClosed]);

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

      <header style={header}>
        <div>
          <h1 style={{ margin: 0 }}>WK Poule 2026</h1>

          {profile && (
            <p style={{ marginTop: 6, color: "#6b7280" }}>
              Welkom, <b>{profile.display_name}</b>
              {profile.department ? ` (${profile.department})` : ""}
            </p>
          )}

          {error && <p style={{ marginTop: 10, color: "#dc2626" }}>Fout: {error}</p>}
        </div>

        <div style={summaryWrap}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Volgende deadline</div>
            {nextStageDeadline?.deadline ? (
              <>
                <div style={summaryValue}>{nextStageDeadline.stage}</div>
                <div style={summaryHint}>{nextStageDeadline.deadline.toLocaleString()}</div>
              </>
            ) : (
              <div style={summaryValue}>—</div>
            )}
          </div>

          <div style={summaryCard}>
            <div style={summaryLabel}>Bonus</div>
            <div style={summaryValue}>
              {bonusAnsweredCount}/{bonusTotal || "—"}{" "}
              {bonusClosed ? <span style={pillClosed}>🔒</span> : <span style={pillOpen}>open</span>}
            </div>
            <div style={summaryHint}>
              Deadline: {groupDeadline ? groupDeadline.toLocaleString() : "onbekend (nog geen GROUP match)"}
            </div>
          </div>
        </div>
      </header>

      <section style={grid}>
        <Link href="/predictions/GROUP" style={card}>
          <div style={cardLeft}>
            <div style={icon}>✍️</div>
            <div>
              <h3 style={cardTitle}>Voorspellen</h3>
              <p style={cardText}>Vul je voorspellingen per fase in</p>
            </div>
          </div>
          <span style={badgeStyle(voorspellenBadge.tone)}>{voorspellenBadge.text}</span>
        </Link>

        <Link href="/my-predictions" style={card}>
          <div style={cardLeft}>
            <div style={icon}>✅</div>
            <div>
              <h3 style={cardTitle}>Mijn voorspellingen</h3>
              <p style={cardText}>Overzicht van je ingevulde wedstrijden</p>
            </div>
          </div>
          <span style={badgeStyle(mijnBadge.tone)}>{mijnBadge.text}</span>
        </Link>

        <Link href="/progress" style={card}>
          <div style={cardLeft}>
            <div style={icon}>📈</div>
            <div>
              <h3 style={cardTitle}>Voortgang WK</h3>
              <p style={cardText}>Groepsstanden A t/m L</p>
            </div>
          </div>
          <span style={badgeStyle("neutral")}>groepen</span>
        </Link>

        <Link href="/results" style={card}>
          <div style={cardLeft}>
            <div style={icon}>📊</div>
            <div>
              <h3 style={cardTitle}>Uitslagen & punten</h3>
              <p style={cardText}>Uitslag, jouw voorspelling en punten</p>
            </div>
          </div>
          <span style={badgeStyle("neutral")}>nieuw</span>
        </Link>

        <Link href="/leaderboard" style={card}>
          <div style={cardLeft}>
            <div style={icon}>🏆</div>
            <div>
              <h3 style={cardTitle}>Ranglijst</h3>
              <p style={cardText}>Standen en bewegingen bekijken</p>
            </div>
          </div>
          <span style={badgeStyle("neutral")}>live</span>
        </Link>

        <Link href="/bonus" style={card}>
          <div style={cardLeft}>
            <div style={icon}>🎁</div>
            <div>
              <h3 style={cardTitle}>Bonusvragen</h3>
              <p style={cardText}>Extra punten voorspellen</p>
            </div>
          </div>
          <span style={badgeStyle(bonusBadge.tone)}>{bonusBadge.text}</span>
        </Link>
      </section>

      {/* ✅ Spelregels / puntentelling (hybride lock) */}
      <section style={{ marginTop: 22 }}>
        <details style={rulesBox}>
          <summary style={rulesSummary}>
            <span style={{ fontWeight: 800 }}>Spelregels & puntentelling</span>
            <span style={{ color: "#6b7280", fontSize: 13 }}> (klik om te openen)</span>
          </summary>

          <div style={rulesContent}>
            <p style={{ marginTop: 0 }}>
              Per wedstrijd voorspel je de eindstand (90 minuten + blessuretijd). Dus de eindstand zonder eventuele verlengingen.
              Let bij het voorspellen erop dat je op de knop 'Alles opslaan' klikt. Anders wordt er niks opgeslagen. En scoor je geen punten.
            </p>

            <h3 style={rulesH3}>Deadlines</h3>
            <ul style={rulesList}>
              <li>
                <b>Groepsfase:</b> alle groepsfase-wedstrijden moeten zijn ingevuld
                <b> vóór de 1e wedstrijd van het WK (start groepsfase)</b>.
                Daarna is de groepsfase volledig vergrendeld.
              </li>
              <li>
                <b>Knock-out fases:</b> voorspellingen zijn per wedstrijd aan te passen
                tot <b>1 minuut vóór de start</b> van die wedstrijd.
              </li>
              <li>
                <b>Bonusvragen:</b> sluiten vóór de start van de groepsfase.
                Bonuspunten worden tussentijds toegekend zodra de uitkomst bekend is.
              </li>
            </ul>

            <h3 style={rulesH3}>Punten per wedstrijd</h3>
            <ul style={rulesList}>
              <li><b>200</b> – exacte uitslag goed</li>
              <li><b>100</b> – gelijkspel goed (niet exact)</li>
              <li><b>95</b> – juiste winnaar + goals van één team goed</li>
              <li><b>75</b> – juiste winnaar</li>
              <li><b>20</b> – goals van één team goed</li>
              <li><b>0</b> – geen juiste voorspelling</li>
            </ul>

            <p style={{ marginBottom: 0, color: "#6b7280", fontSize: 13 }}>
              Geen voorspelling ingevuld bij een wedstrijd met uitslag? Dan krijg je <b>0 punten</b> voor die wedstrijd.
            </p>
          </div>
        </details>
      </section>
    </PageShell>
  );
}

/* ===== Styles ===== */

const header: React.CSSProperties = {
  marginBottom: 18,
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const summaryWrap: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const summaryCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  minWidth: 220,
  background: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const summaryLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const summaryValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 900,
  color: "#111827",
};

const summaryHint: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: "#6b7280",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
};

const card: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 18,
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  textDecoration: "none",
  color: "#111827",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
};

const cardLeft: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "center",
};

const icon: React.CSSProperties = {
  fontSize: 28,
};

const cardTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
};

const cardText: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#6b7280",
};

const pillOpen: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  background: "#ecfdf5",
  color: "#065f46",
  border: "1px solid #a7f3d0",
};

const pillClosed: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  background: "#f3f4f6",
  color: "#374151",
  border: "1px solid #d1d5db",
};

function badgeStyle(tone: "ok" | "warn" | "neutral" | "closed"): React.CSSProperties {
  if (tone === "ok") {
    return { padding: "4px 10px", borderRadius: 999, fontSize: 12, background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", whiteSpace: "nowrap", fontWeight: 700 };
  }
  if (tone === "warn") {
    return { padding: "4px 10px", borderRadius: 999, fontSize: 12, background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d", whiteSpace: "nowrap", fontWeight: 700 };
  }
  if (tone === "closed") {
    return { padding: "4px 10px", borderRadius: 999, fontSize: 12, background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", whiteSpace: "nowrap", fontWeight: 700 };
  }
  return { padding: "4px 10px", borderRadius: 999, fontSize: 12, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", whiteSpace: "nowrap", fontWeight: 700 };
}

/* --- Spelregels box --- */

const rulesBox: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#fff",
  padding: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const rulesSummary: React.CSSProperties = {
  cursor: "pointer",
  listStyle: "none",
};

const rulesContent: React.CSSProperties = {
  marginTop: 10,
  color: "#111827",
};

const rulesH3: React.CSSProperties = {
  margin: "12px 0 6px",
};

const rulesList: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 10,
  paddingLeft: 18,
};