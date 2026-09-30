import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { findEmployee } from "./employees";

// The JWT alone is not trusted for access: every protected render re-checks the list,
// so turning an employee off in the database locks them out on their next request.
export async function requireEmployee() {
  const session = await auth();
  const employee = await findEmployee(session?.user?.email);
  if (!session || !employee) redirect("/login");
  if (!employee.active) redirect("/login?error=inactive");
  return employee;
}
