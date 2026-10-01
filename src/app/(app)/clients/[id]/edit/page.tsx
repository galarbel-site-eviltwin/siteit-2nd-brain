import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClientAction } from "../../../actions";
import { ClientForm } from "@/components/client-form";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/session";

export default async function EditClient({ params, searchParams }: PageProps<"/clients/[id]/edit">) {
  const me = await requireEmployee();
  const { id } = await params;
  const { error } = await searchParams;
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) notFound();
  return (
    <>
      <Link href={`/clients/${id}`} className="back"><ArrowRight size={20} />{client.name}</Link>
      <div className="page-head"><h1>עריכת לקוח</h1><p>דומיינים, כינויים ואנשי קשר מנוהלים במרחב הלקוח.</p></div>
      <ClientForm action={updateClientAction} client={client} error={typeof error === "string" ? error : undefined} defaultOwner={me.id} />
    </>
  );
}
