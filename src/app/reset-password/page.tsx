"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PageShell from "@/components/PageShell";
import Topbar from "@/components/Topbar";

function isStrongEnough(pw: string) {
  return pw.trim().length >= 6;
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [msg, setMsg] = useState<string | null>(
    "Even checken…"
  );

  const canSubmit = useMemo(() => {
    if (!ready) return false;
    if (!isStrongEnough(password)) return false;
    if (password !== password2) return false;
    return true;
  }, [ready, password, password2]);

  /**
   * 1) Reset-link verwerken:
   * Supabase kan 2 varianten gebruiken:
   * - /reset-password?code=...
   * - /reset-password#access_token=...&type=recovery...
   *
   * We ondersteunen beide.
   */
  useEffect(() => {
    let cancelled = false;

    async function initFromUrl() {
      setMsg("Even checken…");

      try {
        const url = new URL(window.location.href);

        const code = url.searchParams.get("code");
        const hash = window.location.hash; // includes leading "#"

        // Sommige providers geven ook error info mee in hash
        // bijv: #error=access_denied&error_code=otp_expired...
        if (!code && hash && hash.includes("error=")) {
          if (!cancelled) {
            setMsg("De reset-link is ongeldig of verlopen. Vraag opnieuw een reset aan via /login.");
          }
          return;
        }

        let exchangeInput: string | null = null;

        if (code) {
          exchangeInput = code;
        } else if (hash && hash.length > 1) {
          exchangeInput = hash;
        }

        if (!exchangeInput) {
          if (!cancelled) {
            setMsg("Open deze pagina via de reset-link uit je e-mail. Werkt het niet? Vraag dan opnieuw een reset aan via /login.");
          }
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(exchangeInput);

        if (error) {
          if (!cancelled) {
            setMsg("De reset-link is ongeldig of verlopen. Vraag opnieuw een reset aan via /login.");
          }
          return;
        }

        if (!cancelled) {
          setReady(true);
          setMsg(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setMsg("Er ging iets mis bij het verwerken van de reset-link. Vraag opnieuw een reset aan via /login.");
        }
      }
    }

    initFromUrl();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 2) Nieuw wachtwoord opslaan
   */
  async function saveNewPassword() {
    setMsg(null);

    if (!ready) {
      setMsg("Open deze pagina via de reset-link uit je e-mail. Vraag anders opnieuw een reset aan via /login.");
      return;
    }

    if (!isStrongEnough(password)) {
      setMsg("Wachtwoord moet minimaal 6 tekens zijn.");
      return;
    }

    if (password !== password2) {
      setMsg("De wachtwoorden komen niet overeen.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("✅ Wachtwoord aangepast. Je wordt doorgestuurd naar de loginpagina…");

      setTimeout(() => {
        router.replace("/login");
      }, 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell maxWidth={520}>
      <Topbar />

      <h1 style={{ margin: 0 }}>Nieuw wachtwoord instellen</h1>

      {!ready ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: "#6b7280", marginTop: 0 }}>
            {msg ?? "Even geduld…"}
          </p>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            Tip: vraag altijd een <b>nieuwe</b> reset aan als de link verlopen is.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <p style={{ color: "#6b7280", marginTop: 0 }}>
            Kies een nieuw wachtwoord (minimaal 6 tekens).
          </p>

          <label style={lbl}>Nieuw wachtwoord</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nieuw wachtwoord"
            style={inp}
            autoComplete="new-password"
          />

          <label style={lbl}>Herhaal nieuw wachtwoord</label>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="Herhaal nieuw wachtwoord"
            style={inp}
            autoComplete="new-password"
          />

          <button
            onClick={saveNewPassword}
            disabled={busy || !canSubmit}
            style={{
              ...btnPrimary,
              opacity: busy || !canSubmit ? 0.7 : 1,
              cursor: busy || !canSubmit ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Opslaan…" : "Wachtwoord opslaan"}
          </button>

          {msg && (
            <p style={{ marginTop: 12, color: msg.startsWith("✅") ? "#0a7a2f" : "crimson" }}>
              {msg}
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}

const lbl: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  marginBottom: 6,
  fontSize: 12,
  color: "#555",
};

const inp: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #ddd",
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  marginTop: 16,
  padding: 12,
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
};
