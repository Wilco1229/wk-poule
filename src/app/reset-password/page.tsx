"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PageShell from "@/components/PageShell";
import Topbar from "@/components/Topbar";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Stap 1: token uit reset-link omzetten naar een Supabase sessie
   * Dit gebeurt automatisch als de gebruiker via de mail komt
   */
  useEffect(() => {
    async function initFromHash() {
      const hash = window.location.hash;

      if (!hash) {
        setMsg(
          "Open deze pagina via de reset-link uit je e-mail. Werkt het niet? Vraag dan opnieuw een reset aan via /login."
        );
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(hash);

      if (error) {
        setMsg("De reset-link is ongeldig of verlopen. Vraag opnieuw een reset aan.");
        return;
      }

      setReady(true);
    }

    initFromHash();
  }, []);

  /**
   * Stap 2: nieuw wachtwoord opslaan
   */
  async function saveNewPassword() {
    if (!newPassword || newPassword.length < 6) {
      setMsg("Wachtwoord moet minimaal 6 tekens zijn.");
      return;
    }

    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("✅ Wachtwoord aangepast. Je wordt doorgestuurd naar de loginpagina…");

    setTimeout(() => {
      router.replace("/login");
    }, 2000);
  }

  return (
    <PageShell maxWidth={420}>
      <Topbar />

      <h1>Nieuw wachtwoord instellen</h1>

      {!ready ? (
        <p style={{ marginTop: 12, color: "#6b7280" }}>{msg}</p>
      ) : (
        <>
          <label style={{ display: "block", marginTop: 16 }}>
            Nieuw wachtwoord
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimaal 6 tekens"
              style={{
                width: "100%",
                marginTop: 6,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />
          </label>

          <button
            onClick={saveNewPassword}
            disabled={busy}
            style={{
              marginTop: 16,
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Opslaan…" : "Wachtwoord opslaan"}
          </button>

          {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </>
      )}
    </PageShell>
  );
}