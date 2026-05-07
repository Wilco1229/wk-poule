"use client";

import type { ReactNode } from "react";

export default function PageShell({
  children,
  maxWidth = 1100,
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <main style={page}>
      <div style={{ ...container, maxWidth }}>{children}</div>
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #1f2937 0%, #374151 35%, #f3f4f6 100%)",
  padding: 32,
  fontFamily: "sans-serif",
};

const container: React.CSSProperties = {
  margin: "0 auto",
  background: "#ffffff",
  borderRadius: 20,
  padding: 32,
  boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
};