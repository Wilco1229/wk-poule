"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";
import TeamLabel from "@/components/TeamLabel";

type MatchRow = {
  id: number;
  kickoff: string;
  stage: string;
  home_team_id: number;
  away_team_id: number;
};

type TeamRow = {
  id: number;
  name: string;
  country_code: string | null;
};

type ExistingPrediction = {
  match_id: number;
  home_goals: number;
  away_goals: number;
};

type Draft = { home: string; away: string };

export default function PredictionsByStagePage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  const router = useRouter();
  const { stage: rawStage } = use(params);
  const stage = (rawStage ?? "").toUpperCase();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

  // 🔒 Lock-status (fase): deadline = eerste kickoff van de fase
  const [deadline, setDeadline] = useState<Date | null>(null);
  const isClosed = deadline ? new Date() >= deadline : false;

  const teamMap = useMemo(() => {
    const m = new Map<number, { name: string; countryCode: string | null }>();
    for (const t of teams) m.set(t.id, { name: t.name, countryCode: t.country_code });
    return m;
  }, [teams]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setMsg(null);

      try {
        if (!stage) {
          setMsg("Onbekende fase.");
          return;
        }

        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) {
          setMsg(sessErr.message);
          return;
        }
        if (!sessionData.session?.user) {
          router.replace("/login");
          return;
        }

        // Deadline bepalen (eerste kickoff van fase)
        const { data: deadlineRow, error: dlErr } = await supabase
          .from("matches")
          .select("kickoff")
          .eq("stage", stage)
          .order("kickoff", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (dlErr) {
          setMsg(dlErr.message);
          return;
        }

        setDeadline(deadlineRow?.kickoff ? new Date(deadlineRow.kickoff) : null);

        // Teams (incl. country_code voor vlaggen)
        const { data: teamData, error: teamErr } = await supabase
          .from("teams")
          .select("id,name,country_code")
          .order("name");

        if (teamErr) {
          setMsg(teamErr.message);
          return;
        }
        if (!cancelled) setTeams((teamData ?? []) as TeamRow[]);

        // Matches voor fase
        const { data: matchData, error: matchErr } = await supabase
          .from("matches")
          .select("id,kickoff,stage,home_team_id,away_team_id")
          .eq("stage", stage)
          .order("kickoff");

        if (matchErr) {
          setMsg(matchErr.message);
          return;
        }

        const ms = (matchData ?? []) as MatchRow[];
        if (!cancelled) setMatches(ms);

        // Bestaande voorspellingen (RLS => alleen eigen)
        const ids = ms.map((m) => m.id);
        if (ids.length > 0) {
          const { data: predData, error: predErr } = await supabase
            .from("predictions")
            .select("match_id,home_goals,away_goals")
            .in("match_id", ids);

          if (predErr) {
            setMsg(predErr.message);
            return;
          }

          const existing = (predData ?? []) as ExistingPrediction[];
          const initDrafts: Record<number, Draft> = {};

          for (const m of ms) {
            const p = existing.find((e) => e.match_id === m.id);
            initDrafts[m.id] = {
              home: p ? String(p.home_goals) : "",
              away: p ? String(p.away_goals) : "",
            };
          }

          if (!cancelled) setDrafts(initDrafts);
        } else {
          if (!cancelled) setDrafts({});
        }
      } catch (e: any) {
        setMsg(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [stage, router]);

  function setDraft(matchId: number, side: "home" | "away", value: string) {
    setDrafts((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] ?? { home: "", away: "" }),
        [side]: value,
      },
    }));
  }

  async function saveAll() {
    if (isClosed) {
      setMsg("Deze fase is gesloten. Opslaan is niet meer mogelijk.");
      return;
    }

    setMsg(null);
    setSaving(true);

    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) {
        setMsg(sessErr.message);
        return;
      }
      const user = sessionData.session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const rows = matches
        .map((m) => {
          const d = drafts[m.id];
          if (!d) return null;

          const h = d.home.trim();
          const a = d.away.trim();
          if (!h || !a) return null;

          const hg = Number(h);
          const ag = Number(a);
          if (!Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) return null;

          return {
            user_id: user.id,
            match_id: m.id,
            home_goals: hg,
            away_goals: ag,
          };
        })
        .filter(Boolean) as any[];

      if (rows.length === 0) {
        setMsg("Geen geldige voorspellingen om op te slaan.");
        return;
      }

      const { error } = await supabase.from("predictions").upsert(rows, {
        onConflict: "user_id,match_id",
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg(`Opgeslagen ✅ (${rows.length})`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageShell maxWidth={860}>
        <Topbar />
        <p>Laden…</p>
      </PageShell>
    );
  }

  const btnText = isClosed ? "🔒 Gesloten" : saving ? "Opslaan…" : "Alles opslaan";
  const btnDisabled = saving || isClosed;

  return (
    <PageShell maxWidth={860}>
      <Topbar />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Voorspellen – fase {stage}</h1>

        <button
          onClick={saveAll}
          disabled={btnDisabled}
          style={{
            ...btnPrimary,
            background: isClosed ? "#999" : "#111",
            cursor: isClosed ? "not-allowed" : "pointer",
          }}
        >
          {btnText}
        </button>
      </div>

      {deadline && (
        <p style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
          {isClosed
            ? `🔒 Fase gesloten sinds ${deadline.toLocaleString()}`
            : `⏰ Deadline: ${deadline.toLocaleString()}`}
        </p>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        {matches.map((m) => {
          const home = teamMap.get(m.home_team_id);
          const away = teamMap.get(m.away_team_id);
          const d = drafts[m.id] ?? { home: "", away: "" };

          return (
            <div key={m.id} style={card}>
              <div style={{ fontWeight: 700, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <TeamLabel name={home?.name ?? "—"} countryCode={home?.countryCode ?? null} />
                <span>–</span>
                <TeamLabel name={away?.name ?? "—"} countryCode={away?.countryCode ?? null} />
              </div>

              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {new Date(m.kickoff).toLocaleString()}
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                <input
                  value={d.home}
                  onChange={(e) => setDraft(m.id, "home", e.target.value)}
                  disabled={isClosed}
                  inputMode="numeric"
                  placeholder="0"
                  style={scoreInput}
                />
                <span>-</span>
                <input
                  value={d.away}
                  onChange={(e) => setDraft(m.id, "away", e.target.value)}
                  disabled={isClosed}
                  inputMode="numeric"
                  placeholder="0"
                  style={scoreInput}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Onderste opslaan-knop */}
      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={saveAll}
          disabled={btnDisabled}
          style={{
            ...btnPrimary,
            background: isClosed ? "#999" : "#111",
            cursor: isClosed ? "not-allowed" : "pointer",
            minWidth: 180,
          }}
        >
          {btnText}
        </button>
      </div>

      <div style={{ height: 8 }} />
    </PageShell>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const scoreInput: React.CSSProperties = {
  width: 60,
  padding: 8,
  textAlign: "center",
  borderRadius: 8,
  border: "1px solid #ddd",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  color: "#fff",
};