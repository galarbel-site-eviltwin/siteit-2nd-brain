// Chat exports and transcripts carry Israeli wall-clock times with no zone. Convert them to real
// instants, honouring daylight saving, so "when it happened" sorts correctly against everything else.
const TZ = "Asia/Jerusalem";
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function offsetMs(at: number) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at / 1000) * 1000;
}

export function israelTime(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = wall - offsetMs(wall);
  t = wall - offsetMs(t); // second pass settles the hour around DST switches
  return new Date(t);
}

export const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
