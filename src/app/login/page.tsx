
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function isZorgpartnersEmail(value: string) {
    return value.trim().toLowerCase().endsWith("@zorgpartners.nl");
  }

  async function handleSubmit() {
    setMsg(null);

    if (!isZorgpartnersEmail(email)) {
      setMsg("Alleen @zorgpartners.nl e-mailadressen zijn toegestaan.");
      return;
    }

    if (mode === "signup") {
      if (password.length < 8) {
        setMsg("Kies een wachtwoord van minimaal 8 tekens.");
        return;
      }
    }

    setBusy(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setMsg(error.message);
        } else {
          setMsg("Account aangemaakt. Je kunt nu inloggen.");
          setMode("signin");
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMsg(error.message);
      } else {
        // Na login sturen we je later naar /setup of /predictions
        window.location.href = "/";
      }
    } finally {
      setBusy(false);
    }
  }

  // ✅ Stap 1.2: reset mail versturen
  async function sendResetEmail() {
    setMsg(null);

    if (!email || email.trim().length < 3) {
      setMsg("Vul eerst je e-mailadres in.");
      return;
    }

    if (!isZorgpartnersEmail(email)) {
      setMsg("Alleen @zorgpartners.nl e-mailadressen zijn toegestaan.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${location.origin}/reset-password`,
      });

      if (error) setMsg(error.message);
      else setMsg("Reset mail verstuurd. Check je e-mail voor de link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>WK Poule 2026</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setMode("signin")}
          disabled={busy}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "signin" ? "#111" : "#fff",
            color: mode === "signin" ? "#fff" : "#111",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Inloggen
        </button>
        <button
          onClick={() => setMode("signup")}
          disabled={busy}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            background: mode === "signup" ? "#111" : "#fff",
            color: mode === "signup" ? "#fff" : "#111",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Account maken
        </button>
      </div>

      <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>E-mail</label>
      <input
        placeholder="wilco.vanabkoude@zorgpartners.nl"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        disabled={busy}
      />

      <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>Wachtwoord</label>
      <input
        placeholder="Wachtwoord"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
        disabled={busy}
      />

      <button
        onClick={handleSubmit}
        disabled={busy}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 10,
          border: "none",
          background: "#111",
          color: "#fff",
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Even wachten..." : mode === "signin" ? "Inloggen" : "Account maken"}
      </button>

      {/* ✅ Reset-knop alleen tonen bij inloggen */}
      {mode === "signin" && (
        <button
          onClick={sendResetEmail}
          disabled={busy}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            marginTop: 10,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Wachtwoord vergeten
        </button>
      )}

      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}

      <p style={{ marginTop: 18, fontSize: 12, color: "#666" }}>
        Alleen registratie met <b>@zorgpartners.nl</b>.
      </p>
    </main>
  );
}
``