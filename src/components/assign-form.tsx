import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { assignItemAction } from "@/app/(app)/actions";

type Props = { itemId: string; clientId: string | null; options: { id: string; name: string }[]; suggested?: boolean; back?: string };

// Confirming a suggestion is one click; choosing another client is a select away.
export function AssignForm({ itemId, clientId, options, suggested, back = "/ingest" }: Props) {
  return (
    <form action={assignItemAction} className="assign-form">
      <input type="hidden" name="itemId" value={itemId} />
      <label className="sr-only" htmlFor={`c-${itemId}`}>לקוח</label>
      <select id={`c-${itemId}`} name="clientId" defaultValue={clientId ?? ""}>
        <option value="">בחר לקוח...</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button className="btn btn-sm btn-primary"><CheckCircle size={18} weight="fill" />{suggested ? "אישור" : "שיוך"}</button>
      <Link className="btn btn-sm btn-ghost" href={`/clients/new?back=${encodeURIComponent(back)}`}>לקוח חדש</Link>
    </form>
  );
}
