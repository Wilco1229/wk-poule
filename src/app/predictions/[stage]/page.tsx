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

type PublicPredictionRow = {
  display_name: string;
  department: string;
  home_goals: number;
  away_goals: number;
};

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

  // 🔒 Fase-lock (jouw huidige UX): deadline = eerste kickoff van de stage
  const [deadline, setDeadline] = useState<Date | null>(null);
  const isClosed = deadline ? new Date() >= deadline : false;

  // Modal state (voorspellingen van anderen)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [modalRows, setModalRows] = useState<PublicPredictionRow[]>([]);
  const [modalTitle, setModalTitle] = useState<string>("");

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

        // Deadline bepalen (eerste kickoff van deze stage)
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
        if (!cancelled) setDeadline(deadlineRow?.kickoff ? new Date(deadlineRow.kickoff) : null);

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

        // Matches voor deze stage
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

        // Bestaande voorspellingen (RLS: alleen eigen)
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

  function matchStarted(kickoffIso: string) {
    return Date.now() >= new Date(kickoffIso).getTime();
  }

  async function openPublicPredictions(matchId: number, kickoffIso: string) {
    if (!matchStarted(kickoffIso)) return; // alleen na start

    setModalOpen(true);
    setModalLoading(true);
    setModalErr(null);
    setModalRows([]);
    setModalTitle("Voorspellingen van deelnemers");

    try {
      const { data, error } = await supabase.rpc("get_public_predictions", {
        p_match_id: matchId,
      });

      if (error) {
        setModalErr(error.message);
        return;
      }

      setModalRows((data ?? []) as PublicPredictionRow[]);
    } finally {
      setModalLoading(false);
    }
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
          {isClosed ? `🔒 Fase gesloten sinds ${deadline.toLocaleString()}` : `⏰ Deadline: ${deadline.toLocaleString()}`}
        </p>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        {matches.map((m) => {
          const home = teamMap.get(m.home_team_id);
          const away = teamMap.get(m.away_team_id);
          const d = drafts[m.id] ?? { home: "", away: "" };

          const started = matchStarted(m.kickoff);

          return (
            <div
              key={m.id}
              style={{
                ...card,
                cursor: started ? "pointer" : "default",
                outline: started ? "1px solid #e5e7eb" : "none",
              }}
              onClick={() => openPublicPredictions(m.id, m.kickoff)}
              title={started ? "Klik om voorspellingen van anderen te bekijken" : "Pas zichtbaar na start van de wedstrijd"}
            >
              <div style={{ fontWeight: 700, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <TeamLabel name={home?.name ?? "—"} countryCode={home?.countryCode ?? null} />
                <span>–</span>
                <TeamLabel name={away?.name ?? "—"} countryCode={away?.countryCode ?? null} />
                {started ? <span style={pill}>👀 Bekijk voorspellingen</span> : null}
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
                  onClick={(e) => e.stopPropagation()}
                />
                <span>-</span>
                <input
                  value={d.away}
                  onChange={(e) => setDraft(m.id, "away", e.target.value)}
                  disabled={isClosed}
                  inputMode="numeric"
                  placeholder="0"
                  style={scoreInput}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          );
        })}
      </div>

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
                  </div>

                  {modalRows.map((r, idx) => (
                    <div key={idx} style={listRow}>
                      <div>
                        <b>{r.display_name}</b>
                        {r.department ? <span style={{ color: "#6b7280" }}> ({r.department})</span> : null}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 800 }}>
                        {r.home_goals} - {r.away_goals}
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
  width: "min(720px, 100%)",
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
  gridTemplateColumns: "1fr 120px",
  background: "#f7f7f7",
  padding: 10,
  fontWeight: 800,
  fontSize: 13,
};

const listRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 120px",
  padding: 10,
  borderTop: "1px solid #eee",
  alignItems: "center",
};