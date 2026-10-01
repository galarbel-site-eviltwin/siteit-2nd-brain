import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { createClientAction } from "../../actions";
import { ClientForm } from "@/components/client-form";
import { requireEmployee } from "@/lib/session";

export default async function NewClient({ searchParams }: PageProps<"/clients/new">) {
  const me = await requireEmployee();
  const { error, back } = await searchParams;
  return (
    <>
      <Link href="/clients" className="back"><ArrowRight size={20} />כל הלקוחות</Link>
      <div className="page-head"><h1>לקוח חדש</h1><p>מספיק שם ודומיין. את השאר אפשר להשלים אחר כך.</p></div>
      <ClientForm action={createClientAction} error={typeof error === "string" ? error : undefined} back={typeof back === "string" && back.startsWith("/") ? back : undefined} defaultOwner={me.id} />
    </>
  );
}
