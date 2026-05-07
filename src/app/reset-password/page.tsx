
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Als je via de reset-link binnenkomt, krijgt Supabase doorgaans een PASSWORD_RECOVERY event.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setMsg("Kies een nieuw wachtwoord.");
      }
    });

    // Fallback: soms is er al een sessie gezet.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function saveNewPassword() {
    setMsg(null);

    if (newPassword.length < 8) {
      setMsg("Kies een wachtwoord van minimaal 8 tekens.");
      return;
    }
    if (newPassword !== newPassword2) {
      setMsg("Wachtwoorden komen niet overeen.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Wachtwoord aangepast. Je kunt nu opnieuw inloggen.");
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Nieuw wachtwoord instellen</h1>

      {!ready && (
        <p>
          Open deze pagina via de reset-link uit je e-mail. Werkt het niet? Vraag dan opnieuw een reset aan via{" "}
          <a href="/login">/login</a>.
        </p>
      )}

      {ready && (
        <>
          <p>Kies je nieuwe wachtwoord:</p>

          <input
            type="password"
            placeholder="Nieuw wachtwoord"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />

          <input
            type="password"
            placeholder="Herhaal nieuw wachtwoord"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />

          <button
            onClick={saveNewPassword}
            disabled={saving}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
