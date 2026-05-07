"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";

type BonusQuestion = {
  id: number;
  code: string;
  question: string;
  answer_type: "text" | "number" | "boolean";
  points: number;
  options: string[] | null; // jsonb array in DB
};

type BonusAnswerRow = {
  question_id: number;
  answer_text: string | null;
  answer_number: number | null;
  answer_bool: boolean | null;
};

type Draft = {
  text: string;
  number: string;
  bool: "" | "true" | "false";
};

const emptyDraft: Draft = { text: "", number: "", bool: "" };

export default function BonusPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [questions, setQuestions] = useState<BonusQuestion[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

  // 🔒 Bonus lock status
  const [deadline, setDeadline] = useState<Date | null>(null);
  const bonusClosed = deadline ? new Date() >= deadline : false;

  // voor display: hoeveel ingevuld?
  const answeredCount = useMemo(() => {
    let c = 0;
    for (const q of questions) {
      const d = drafts[q.id];
      if (!d) continue;

      if (q.answer_type === "text") {
        if ((d.text ?? "").trim()) c++;
      } else if (q.answer_type === "number") {
        if ((d.number ?? "").trim()) c++;
      } else if (q.answer_type === "boolean") {
        if (d.bool === "true" || d.bool === "false") c++;
      }
    }
    return c;
  }, [questions, drafts]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setMsg(null);

      try {
        // login check
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

        // ✅ bonus deadline = eerste GROUP wedstrijd
        const { data: dlRow, error: dlErr } = await supabase
          .from("matches")
          .select("kickoff")
          .eq("stage", "GROUP")
          .order("kickoff", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (dlErr) {
          if (!cancelled) setMsg(dlErr.message);
          return;
        }
        if (dlRow?.kickoff) {
          if (!cancelled) setDeadline(new Date(dlRow.kickoff));
        }

        // vragen laden
        const { data: qData, error: qErr } = await supabase
          .from("bonus_questions")
          .select("id,code,question,answer_type,points,options")
          .order("id", { ascending: true });

        if (qErr) {
          if (!cancelled) setMsg(qErr.message);
          return;
        }

        const qs = (qData ?? []) as BonusQuestion[];
        if (!cancelled) setQuestions(qs);

        // bestaande antwoorden laden
        const qIds = qs.map((q) => q.id);
        let existing: BonusAnswerRow[] = [];

        if (qIds.length > 0) {
          const { data: aData, error: aErr } = await supabase
            .from("bonus_answers")
            .select("question_id,answer_text,answer_number,answer_bool")
            .in("question_id", qIds);

          if (aErr) {
            if (!cancelled) setMsg(aErr.message);
            return;
          }

          existing = (aData ?? []) as BonusAnswerRow[];
        }

        const initDrafts: Record<number, Draft> = {};
        for (const q of qs) {
          const a = existing.find((x) => x.question_id === q.id);
          initDrafts[q.id] = {
            text: (a?.answer_text ?? "").trim(),
            number: a?.answer_number != null ? String(a.answer_number) : "",
            bool: a?.answer_bool == null ? "" : a.answer_bool ? "true" : "false",
          };
        }

        if (!cancelled) setDrafts(initDrafts);
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

  function updateDraft(qId: number, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] ?? emptyDraft), ...patch },
    }));
  }

  async function saveAll() {
    if (bonusClosed) {
      setMsg("Bonusvragen zijn gesloten. Opslaan is niet meer mogelijk.");
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

      // dropdowns voor alle TEXT vragen → options moeten gevuld zijn
      const missing = questions.filter(
        (q) => q.answer_type === "text" && (!Array.isArray(q.options) || q.options.length === 0)
      );
      if (missing.length > 0) {
        setMsg(
          `Deze text-vragen hebben nog geen dropdown-opties (bonus_questions.options): ${missing
            .map((q) => q.code)
            .join(", ")}`
        );
        return;
      }

      const rows = questions
        .map((q) => {
          const d = drafts[q.id] ?? emptyDraft;

          if (q.answer_type === "text") {
            const t = (d.text ?? "").trim();
            if (!t) return null;
            return { user_id: user.id, question_id: q.id, answer_text: t };
          }

          if (q.answer_type === "number") {
            const n = (d.number ?? "").trim();
            if (!n) return null;
            const val = Number(n);
            if (!Number.isFinite(val)) return null;
            return { user_id: user.id, question_id: q.id, answer_number: val };
          }

          if (q.answer_type === "boolean") {
            if (d.bool !== "true" && d.bool !== "false") return null;
            return { user_id: user.id, question_id: q.id, answer_bool: d.bool === "true" };
          }

          return null;
        })
        .filter(Boolean) as any[];

      if (rows.length === 0) {
        setMsg("Geen geldige antwoorden om op te slaan. Vul minstens één bonusvraag in.");
        return;
      }

      const { error } = await supabase.from("bonus_answers").upsert(rows, {
        onConflict: "user_id,question_id",
      });

      if (error) {
        // Hier kan ook de DB-trigger deadline error komen
        if (error.message.toLowerCase().includes("gesloten")) {
          setMsg("Bonusvragen zijn gesloten. Opslaan is niet meer mogelijk.");
        } else {
          setMsg(error.message);
        }
        return;
      }

      setMsg(`Opgeslagen ✅ (${rows.length} antwoord(en))`);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageShell maxWidth={900}>
        <Topbar />
        <p style={{ marginTop: 12 }}>Laden…</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth={900}>
      <Topbar />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Bonusvragen</h1>
          <p style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
            Ingevuld: <b>{answeredCount}</b> / {questions.length}
          </p>
        </div>

        <button
          onClick={saveAll}
          disabled={saving || bonusClosed}
          style={{
            ...btnPrimary,
            background: bonusClosed ? "#999" : "#111",
            cursor: bonusClosed ? "not-allowed" : "pointer",
          }}
        >
          {bonusClosed ? "🔒 Gesloten" : saving ? "Opslaan…" : "Alles opslaan"}
        </button>
      </div>

      {deadline && (
        <p style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
          {bonusClosed
            ? `🔒 Bonus gesloten sinds ${deadline.toLocaleString()}`
            : `⏰ Deadline bonus: ${deadline.toLocaleString()}`}
        </p>
      )}

      {!deadline && (
        <p style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
          ⏰ Deadline bonus: onbekend (nog geen GROUP-wedstrijd ingevoerd)
        </p>
      )}

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        {questions.map((q) => {
          const d = drafts[q.id] ?? emptyDraft;
          const hasOptions = Array.isArray(q.options) && q.options.length > 0;

          return (
            <div key={q.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 600 }}>{q.question}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{q.points} punten</div>
                </div>

                {q.answer_type === "text" && (
                  <select
                    value={d.text}
                    onChange={(e) => updateDraft(q.id, { text: e.target.value })}
                    style={inp}
                    disabled={bonusClosed}
                  >
                    <option value="">(kies een antwoord)</option>

                    {d.text && hasOptions && !q.options!.includes(d.text) && (
                      <option value={d.text}>(bestaand) {d.text}</option>
                    )}

                    {hasOptions &&
                      q.options!.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                  </select>
                )}

                {q.answer_type === "number" && (
                  <input
                    value={d.number}
                    onChange={(e) => updateDraft(q.id, { number: e.target.value })}
                    placeholder="Getal"
                    inputMode="numeric"
                    style={inp}
                    disabled={bonusClosed}
                  />
                )}

                {q.answer_type === "boolean" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => updateDraft(q.id, { bool: "true" })}
                      disabled={bonusClosed}
                      style={{
                        ...btnSmall,
                        background: d.bool === "true" ? "#111" : "#fff",
                        color: d.bool === "true" ? "#fff" : "#111",
                        cursor: bonusClosed ? "not-allowed" : "pointer",
                        opacity: bonusClosed ? 0.7 : 1,
                      }}
                    >
                      Ja
                    </button>

                    <button
                      onClick={() => updateDraft(q.id, { bool: "false" })}
                      disabled={bonusClosed}
                      style={{
                        ...btnSmall,
                        background: d.bool === "false" ? "#111" : "#fff",
                        color: d.bool === "false" ? "#fff" : "#111",
                        cursor: bonusClosed ? "not-allowed" : "pointer",
                        opacity: bonusClosed ? 0.7 : 1,
                      }}
                    >
                      Nee
                    </button>

                    <button
                      onClick={() => updateDraft(q.id, { bool: "" })}
                      disabled={bonusClosed}
                      style={{
                        ...btnSmall,
                        cursor: bonusClosed ? "not-allowed" : "pointer",
                        opacity: bonusClosed ? 0.7 : 1,
                      }}
                      title="Leeg maken"
                    >
                      Leeg
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 14,
  background: "#fff",
};

const inp: React.CSSProperties = {
  width: 320,
  maxWidth: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  color: "#fff",
};

const btnSmall: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
};