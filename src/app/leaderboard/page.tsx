"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Topbar from "@/components/Topbar";
import PageShell from "@/components/PageShell";

type Row = {
  position: number;
  user_id: string;
  display_name: string;
  department: string | null;
  total_points: number;
  last_match_points: number | null;
};

type SortMode = "rank" | "total_desc" | "name_asc";
type Movement = "up" | "down" | "same" | "new";

type MovementState = {
  prevPosByUser: Record<string, number>;
  movementByUser: Record<string, Movement>;
  deltaByUser: Record<string, number>; // plekken verschil
};

const LS_KEY = "wk_poule_leaderboard_movement_v2";

function loadMovementState(): MovementState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { prevPosByUser: {}, movementByUser: {}, deltaByUser: {} };
    const parsed = JSON.parse(raw);
    return {
      prevPosByUser: parsed?.prevPosByUser ?? {},
      movementByUser: parsed?.movementByUser ?? {},
      deltaByUser: parsed?.deltaByUser ?? {},
    };
  } catch {
    return { prevPosByUser: {}, movementByUser: {}, deltaByUser: {} };
  }
}

function saveMovementState(state: MovementState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export default function LeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [movementState, setMovementState] = useState<MovementState>({
    prevPosByUser: {},
    movementByUser: {},
    deltaByUser: {},
  });

  async function load() {
    setMsg(null);

    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
      setMsg(sessErr.message);
      setLoading(false);
      return;
    }
    const user = sessionData.session?.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setMyUserId(user.id);

    const { data, error } = await supabase
      .from("v_leaderboard")
      .select("position,user_id,display_name,department,total_points,last_match_points")
      .order("position", { ascending: true });

    if (error) {
      setMsg(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const newRows = (data ?? []) as Row[];

    // Beweging berekenen (en laten "staan" als er geen verandering is)
    const current = loadMovementState();
    const next: MovementState = {
      prevPosByUser: { ...current.prevPosByUser },
      movementByUser: { ...current.movementByUser },
      deltaByUser: { ...current.deltaByUser },
    };

    for (const r of newRows) {
      const prevPos = next.prevPosByUser[r.user_id];

      if (prevPos === undefined) {
        next.prevPosByUser[r.user_id] = r.position;
        next.movementByUser[r.user_id] = "new";
        next.deltaByUser[r.user_id] = 0;
        continue;
      }

      if (r.position < prevPos) {
        const delta = prevPos - r.position;
        next.movementByUser[r.user_id] = "up";
        next.deltaByUser[r.user_id] = delta;
        next.prevPosByUser[r.user_id] = r.position;
      } else if (r.position > prevPos) {
        const delta = r.position - prevPos;
        next.movementByUser[r.user_id] = "down";
        next.deltaByUser[r.user_id] = delta;
        next.prevPosByUser[r.user_id] = r.position;
      } else {
        // gelijk: laat movement & delta staan zoals ze waren
      }
    }

    saveMovementState(next);
    setMovementState(next);

    setRows(newRows);
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => {
    setMovementState(loadMovementState());
    load();

    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;

    if (q) {
      list = list.filter((r) => {
        const name = (r.display_name ?? "").toLowerCase();
        const dept = (r.department ?? "").toLowerCase();
        return name.includes(q) || dept.includes(q);
      });
    }

    if (sortMode === "total_desc") {
      list = [...list].sort(
        (a, b) => b.total_points - a.total_points || a.display_name.localeCompare(b.display_name)
      );
    } else if (sortMode === "name_asc") {
      list = [...list].sort((a, b) => a.display_name.localeCompare(b.display_name));
    } else {
      list = [...list].sort((a, b) => a.position - b.position);
    }

    return list;
  }, [rows, search, sortMode]);

  function formatLast(points: number | null) {
    if (points === null || points === undefined) return "-";
    if (points > 0) return `+${points}`;
    return String(points);
  }

  function medal(pos: number) {
    if (pos === 1) return "🥇";
    if (pos === 2) return "🥈";
    if (pos === 3) return "🥉";
    return "";
  }

  function movementBadge(userId: string): { text: string; color: string } {
    const m = movementState.movementByUser[userId];
    const d = movementState.deltaByUser[userId] ?? 0;

    if (m === "up") return { text: `↑${d}`, color: "#0a7a2f" }; // groen
    if (m === "down") return { text: `↓${d}`, color: "#c1121f" }; // rood
    if (m === "new") return { text: "★", color: "#111" };
    return { text: "•", color: "#999" };
  }

  function rowStyle(pos: number, isMe: boolean): React.CSSProperties {
    const base: React.CSSProperties = {
      display: "grid",
      gridTemplateColumns: "130px 1fr 170px 170px",
      padding: 12,
      borderTop: "1px solid #eee",
      alignItems: "center",
      background: "#fff",
    };

    if (pos === 1) base.background = "#fff7d6";
    if (pos === 2) base.background = "#f2f2f2";
    if (pos === 3) base.background = "#fff0e6";

    if (isMe) {
      base.outline = "2px solid #111";
      base.outlineOffset = "-2px";
      base.borderTop = "1px solid #ddd";
    }

    return base;
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
          <h1 style={{ margin: 0 }}>Ranglijst</h1>
          {lastUpdated && (
            <p style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              Laatst bijgewerkt: {lastUpdated.toLocaleTimeString()} (auto: elke 30s)
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek speler of afdeling…"
            style={searchInput}
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            style={selectStyle}
          >
            <option value="rank">Sorteren: positie</option>
            <option value="total_desc">Sorteren: totaal (hoog→laag)</option>
            <option value="name_asc">Sorteren: naam (A→Z)</option>
          </select>
          <button onClick={load} style={btnOutline}>
            Vernieuwen
          </button>
        </div>
      </div>

      {msg && (
        <div style={errorBox}>
          <b>Fout:</b> {msg}
        </div>
      )}

      <div style={tableWrap}>
        <div style={headerRow}>
          <div>Positie</div>
          <div>Speler</div>
          <div style={{ textAlign: "right" }}>Laatste wedstrijd</div>
          <div style={{ textAlign: "right" }}>Totaal punten</div>
        </div>

        {filteredSorted.map((r) => {
          const isMe = myUserId != null && r.user_id === myUserId;
          const mv = movementBadge(r.user_id);

          return (
            <div key={r.user_id} style={rowStyle(r.position, isMe)}>
              <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{r.position}</span>
                <span style={{ color: mv.color, fontWeight: 900, minWidth: 40 }}>{mv.text}</span>
                <span>{medal(r.position)}</span>
              </div>

              <div>
                <span style={{ fontWeight: 650 }}>{r.display_name}</span>
                {r.department ? <span style={{ color: "#666" }}> ({r.department})</span> : null}
                {isMe ? <span style={{ marginLeft: 8, fontSize: 12, color: "#111" }}>— jij</span> : null}
              </div>

              <div
                style={{
                  textAlign: "right",
                  fontWeight: 800,
                  color: r.last_match_points != null && r.last_match_points > 0 ? "#0a7a2f" : "#111",
                }}
              >
                {formatLast(r.last_match_points)}
              </div>

              <div style={{ textAlign: "right", fontWeight: 900 }}>{r.total_points}</div>
            </div>
          );
        })}

        {filteredSorted.length === 0 && <div style={{ padding: 12 }}>Geen resultaten.</div>}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
        Pijltjes = verandering t.o.v. vorige refresh (op dit apparaat). Als er niets verandert, blijft het pijltje staan.
      </div>
    </PageShell>
  );
}

const btnOutline: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  cursor: "pointer",
};

const searchInput: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  minWidth: 220,
};

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
};

const tableWrap: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #ddd",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const headerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "130px 1fr 170px 170px",
  background: "#f7f7f7",
  padding: 12,
  fontWeight: 700,
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f3b5b5",
  background: "#fff0f0",
  color: "#8a0000",
};