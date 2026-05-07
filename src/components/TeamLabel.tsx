"use client";

export default function TeamLabel({
  name,
  countryCode,
}: {
  name: string;
  countryCode?: string | null;
}) {
  const cc = (countryCode ?? "").toLowerCase().trim();

  // Twemoji flags uses ISO-3166 alpha-2 lower-case in path
  // Example: https://twemoji.maxcdn.com/v/latest/svg/1f1f3-1f1f1.svg (NL)
  // We need to convert "nl" -> "1f1f3-1f1f1" (regional indicator codepoints)
  const flagUrl = cc && /^[a-z]{2}$/.test(cc) ? twemojiFlagUrl(cc) : null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {flagUrl ? (
        <img
          src={flagUrl}
          alt=""
          width={18}
          height={18}
          style={{ width: 18, height: 18, borderRadius: 3 }}
          loading="lazy"
          onError={(e) => {
            // als iets faalt: verberg icoon (geen “broken image”)
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      <span>{name}</span>
    </span>
  );
}

function twemojiFlagUrl(cc: string) {
  // Regional Indicator Symbol Letter A starts at 0x1F1E6
  const A = 0x1f1e6;
  const codePoints = [...cc.toUpperCase()].map((c) => A + c.charCodeAt(0) - 65);
  const hex = codePoints.map((cp) => cp.toString(16)).join("-");
  return `https://twemoji.maxcdn.com/v/latest/svg/${hex}.svg`;
}