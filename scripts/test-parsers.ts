import { readFileSync } from "node:fs";
import { looksLikeWhatsApp, parseWhatsApp, chatNameFromFile } from "../src/lib/ingest/whatsapp";
import { parseTranscript, isTranscript, findDate } from "../src/lib/ingest/transcript";
import { chunkChat, chunkTranscript } from "../src/lib/ingest/chunk";
const il = (d: Date | null) => d ? d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }) : null;
for (const f of ["whatsapp-android.txt", "whatsapp-ios.txt"]) {
  const t = readFileSync("scripts/fixtures/" + f, "utf8");
  const p = parseWhatsApp(t);
  console.log(f, "detected:", looksLikeWhatsApp(t), "msgs:", p.messages.length, "people:", p.participants, "first:", il(p.messages[1].at), "multiline:", JSON.stringify(p.messages[3]?.text), "media:", p.messages.filter(m => m.media).length, "chunks:", chunkChat(p.messages).length);
}
console.log("name:", chatNameFromFile("WhatsApp Chat with נגה לוי.txt"), "|", chatNameFromFile("צ'אט WhatsApp עם נגה.txt"));
for (const f of ["timeless-a.txt", "timeless-b.txt"]) {
  const t = readFileSync("scripts/fixtures/" + f, "utf8");
  const s = parseTranscript(t);
  console.log(f, "transcript:", isTranscript(s), "segments:", s.filter(x => x.speaker).length, "speakers:", [...new Set(s.map(x => x.speaker).filter(Boolean))], "date:", il(findDate(t)), "firstTs:", s.find(x => x.startMs)?.startMs, "chunks:", chunkTranscript(s).length);
}
