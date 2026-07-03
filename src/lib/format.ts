export const brl = (v?: number | null) =>
  typeof v === "number" && isFinite(v)
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "—";

export const brlFull = (v?: number | null) =>
  typeof v === "number" && isFinite(v)
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

export const pct = (v?: number | null) =>
  typeof v === "number" && isFinite(v) ? `${v.toFixed(1)}%` : "—";

export const compactBR = (v?: number | null) =>
  typeof v === "number" && isFinite(v)
    ? v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
    : "—";
