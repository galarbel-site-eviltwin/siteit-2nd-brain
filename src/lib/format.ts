const TZ = "Asia/Jerusalem";
const dateFmt = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
const rel = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

export const fmtDate = (d: Date | null | undefined) => (d ? dateFmt.format(d) : "");
export const fmtDateTime = (d: Date | null | undefined) => (d ? dateTimeFmt.format(d) : "");
export const isoDay = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d) : "");

export function ago(d: Date | null | undefined) {
  if (!d) return "";
  const s = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return "עכשיו";
  if (abs < 3600) return rel.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rel.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rel.format(Math.round(s / 86400), "day");
  return fmtDate(d);
}

export const msToClock = (ms: number | null) => {
  if (ms == null) return "";
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`;
};
