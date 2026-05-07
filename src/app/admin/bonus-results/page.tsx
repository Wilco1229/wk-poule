"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";

type BonusQuestion = {
  id: number;
  code: string;
  question: string;
  answer_type: "text" | "number" | "boolean";
  points: number;
  options: string[] | null;
};

type BonusResultRow = {
  question_id: number;
  result_text: string | null;
  result_number: number | null;
  result_bool: boolean | null;
};

type Draft = {
  text: string;
  number: string;
  bool: "" | "true" | "false";
};

const emptyDraft: Draft = { text: "", number: "", bool: "" };

export default function AdminBonusResultsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [questions, setQuestions] = useState<BonusQuestion[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

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
        setLoading(false);
        return;
      }

      const admin = roleData?.role === "admin";
      setIsAdmin(admin);
      if (!admin) {
        setLoading(false);
        return;
      }

      const { data: qData, error: qErr } = await supabase
        .from("bonus_questions")
        .select("id,code,question,answer_type,points,options")
        .order("id", { ascending: true });

      if (qErr) {
        setMsg(qErr.message);
        setLoading(false);
        return;
      }

      const qs = (qData ?? []) as BonusQuestion[];
      setQuestions(qs);

      const qIds = qs.map((q) => q.id);
      let existing: BonusResultRow[] = [];

      if (qIds.length > 0) {
        const { data: rData, error: rErr } = await supabase
          .from("bonus_results")
          .select("question_id,result_text,result_number,result_bool")
          .in("question_id", qIds);

        if (rErr) {
          setMsg(rErr.message);
          setLoading(false);
          return;
        }

        existing = (rData ?? []) as BonusResultRow[];
      }

      const initDrafts: Record<number, Draft> = {};
      for (const q of qs) {
        const r = existing.find((x) => x.question_id === q.id);
        initDrafts[q.id] = {
          text: (r?.result_text ?? "").trim(),
          number: r?.result_number != null ? String(r.result_number) : "",
          bool: r?.result_bool == null ? "" : r.result_bool ? "true" : "false",
        };
      }

      setDrafts(initDrafts);
      setLoading(false);
    }

    init();
  }, []);

  function updateDraft(qId: number, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] ?? emptyDraft), ...patch },
    }));
  }

  async function saveAll() {
    setMsg(null);

    if (!isAdmin) {
      setMsg("Geen toegang (admin vereist).");
      return;
    }

    const rows = questions
      .map((q) => {
        const d = drafts[q.id] ?? emptyDraft;

        if (q.answer_type === "text") {
          const t = (d.text ?? "").trim();
          if (!t) return null;
          return { question_id: q.id, result_text: t, updated_at: new Date().toISOString() };
        }

        if (q.answer_type === "number") {
          const n = (d.number ?? "").trim();
          if (!n) return null;
          const val = Number(n);
          if (!Number.isFinite(val)) return null;
          return { question_id: q.id, result_number: val, updated_at: new Date().toISOString() };
        }

        if (q.answer_type === "boolean") {
          if (d.bool !== "true" && d.bool !== "false") return null;
          return { question_id: q.id, result_bool: d.bool === "true", updated_at: new Date().toISOString() };
        }

        return null;
      })
      .filter(Boolean) as any[];

    if (rows.length === 0) {
      setMsg("Geen geldige uitkomsten om op te slaan (vul minstens één resultaat in).");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("bonus_results").upsert(rows, {
      onConflict: "question_id",
    });
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg(`Bonus-uitkomsten opgeslagen ✅ (${rows.length})`);
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
        <h1>Admin – Bonus-uitkomsten</h1>
        <button onClick={saveAll} disabled={saving} style={btnPrimary}>
          {saving ? "Opslaan…" : "Alles opslaan"}
        </button>
      </div>

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

                {q.answer_type === "text" && hasOptions && (
                  <select
                    value={d.text}
                    onChange={(e) => updateDraft(q.id, { text: e.target.value })}
                    style={inp}
                  >
                    <option value="">(kies het juiste antwoord)</option>
                    {d.text && !q.options!.includes(d.text) && (
                      <option value={d.text}>(bestaand) {d.text}</option>
                    )}
                    {q.options!.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {q.answer_type === "text" && !hasOptions && (
                  <input
                    value={d.text}
                    onChange={(e) => updateDraft(q.id, { text: e.target.value })}
                    placeholder="Juiste antwoord"
                    style={inp}
                  />
                )}

                {q.answer_type === "number" && (
                  <input
                    value={d.number}
                    onChange={(e) => updateDraft(q.id, { number: e.target.value })}
                    placeholder="Getal"
                    inputMode="numeric"
                    style={inp}
                  />
                )}

                {q.answer_type === "boolean" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => updateDraft(q.id, { bool: "true" })}
                      style={{
                        ...btnSmall,
                        background: d.bool === "true" ? "#111" : "#fff",
                        color: d.bool === "true" ? "#fff" : "#111",
                      }}
                    >
                      Ja
                    </button>
                    <button
                      onClick={() => updateDraft(q.id, { bool: "false" })}
                      style={{
                        ...btnSmall,
                        background: d.bool === "false" ? "#111" : "#fff",
                        color: d.bool === "false" ? "#fff" : "#111",
                      }}
                    >
                      Nee
                    </button>
                    <button
                      onClick={() => updateDraft(q.id, { bool: "" })}
                      style={btnSmall}
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
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 14,
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
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
};