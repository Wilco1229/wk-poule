
export function flagEmoji(countryCode?: string | null) {
  if (!countryCode) return "";
  const cc = countryCode.toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(cc)) return "";

  // Regional Indicator Symbols: A = 🇦 (U+1F1E6)
  const A = 0x1f1e6;
  const codePoints = [...cc].map((c) => A + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}
