import { redirect } from "next/navigation";

// Team management is open to every employee now (decisions.md): the old admin page lives at /team.
export default function Admin() {
  redirect("/team");
}
