import { asc, eq } from "drizzle-orm";
import { AskChat } from "@/components/ask-chat";
import { BrainAnim } from "@/components/brain/brain-anim";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/session";

export default async function Ask({ searchParams }: PageProps<"/ask">) {
  await requireEmployee();
  const sp = await searchParams;
  const options = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active")).orderBy(asc(clients.name));
  const initial = typeof sp.client === "string" && (sp.client === "company" || options.some((o) => o.id === sp.client)) ? sp.client : null;
  return (
    <>
      <section className="brain-hero ask-hero">
        <BrainAnim label="המוח של סייט איט" />
        <div className="ask-hero-copy">
          <h1>שאל את המוח</h1>
          <p>כל שאלה על לקוח, פגישה או החלטה, עם מקור לכל תשובה.</p>
        </div>
      </section>
      <AskChat clients={options} initialClient={initial} />
    </>
  );
}
