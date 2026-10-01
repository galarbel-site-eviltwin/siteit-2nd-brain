"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clientAliases, clients, connections, driveFiles, driveFolders, type Employee } from "@/lib/db/schema";
import { audit } from "@/lib/employees";
import { normName } from "@/lib/ingest/match";
import { accessToken, FOLDER, folderIdFromLink, getConnection, getFolder, getRoots, SERVICE_SETS, type DriveConfig, type DriveRoot } from "@/lib/drive/google";
import { syncDrive } from "@/lib/drive/sync";
import { requireEmployee } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = () => { revalidatePath("/ingest/drive"); revalidatePath("/ingest"); revalidatePath("/clients"); };

async function roots() {
  return getRoots((await getConnection())?.config as DriveConfig);
}
async function saveRoots(next: DriveRoot[]) {
  await db.update(connections).set({ config: { roots: next } }).where(eq(connections.provider, "google_drive"));
}
async function servicesFor(rootId: string | null) {
  return (await roots()).find((r) => r.id === rootId)?.services ?? [];
}

// ---------- top folders ----------

export async function addRootAction(form: FormData) {
  const me = await requireEmployee();
  const id = str(form, "rootFolderId"), name = str(form, "rootName"), driveId = str(form, "driveId");
  const services = SERVICE_SETS[str(form, "svc")]?.services ?? [];
  if (!id) redirect("/ingest/drive");
  const current = await roots();
  if (!current.some((r) => r.id === id)) await saveRoots([...current, { id, name, driveId: driveId || undefined, services }]);
  await audit("drive_root_added", me.email, { name, services });
  await syncDrive({ budgetMs: 40_000, maxFiles: 0 }); // only lists the client folders; files come once they are linked
  done();
  redirect("/ingest/drive");
}

export async function addRootByLinkAction(form: FormData) {
  await requireEmployee();
  const id = folderIdFromLink(str(form, "link"));
  if (!id) redirect("/ingest/drive?add=1&error=link");
  let folder: Awaited<ReturnType<typeof getFolder>>;
  try {
    folder = await getFolder(await accessToken(), id);
  } catch {
    redirect("/ingest/drive?add=1&error=link_access");
  }
  if (folder.mimeType !== FOLDER) redirect("/ingest/drive?add=1&error=not_folder");
  const f = new FormData();
  f.set("driveId", folder.driveId ?? ""); f.set("rootFolderId", folder.id); f.set("rootName", folder.name); f.set("svc", str(form, "svc"));
  await addRootAction(f);
}

export async function setRootServiceAction(form: FormData) {
  await requireEmployee();
  const id = str(form, "rootId"), services = SERVICE_SETS[str(form, "svc")]?.services ?? [];
  await saveRoots((await roots()).map((r) => (r.id === id ? { ...r, services } : r)));
  done();
}

export async function removeRootAction(form: FormData) {
  const me = await requireEmployee();
  const id = str(form, "rootId");
  await saveRoots((await roots()).filter((r) => r.id !== id));
  // Its client folders stop syncing. Clients and what was already ingested stay.
  const gone = await db.select({ id: driveFolders.folderId }).from(driveFolders).where(eq(driveFolders.rootId, id));
  if (gone.length) {
    await db.delete(driveFiles).where(inArray(driveFiles.folderId, gone.map((g) => g.id)));
    await db.delete(driveFolders).where(eq(driveFolders.rootId, id));
  }
  await audit("drive_root_removed", me.email, { rootId: id });
  done();
}

// ---------- client folders ----------

async function addServices(clientId: string, services: string[]) {
  if (!services.length) return;
  const [c] = await db.select({ services: clients.services }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!c) return;
  const merged = [...new Set([...c.services, ...services])];
  if (merged.length !== c.services.length) await db.update(clients).set({ services: merged, updatedAt: new Date() }).where(eq(clients.id, clientId));
}

async function newClientFor(folderId: string, me: Employee) {
  const [f] = await db.select().from(driveFolders).where(eq(driveFolders.folderId, folderId)).limit(1);
  if (!f || f.status !== "pending") return;
  // A folder named like an existing client links to it instead of creating a twin.
  const n = normName(f.name);
  const [same] = await db.select({ id: clientAliases.clientId }).from(clientAliases).where(and(eq(clientAliases.kind, "name"), eq(clientAliases.value, n))).limit(1);
  let clientId = same?.id;
  if (!clientId) {
    const [c] = await db.insert(clients).values({ name: f.name, ownerId: me.id, status: "active", services: await servicesFor(f.rootId) }).returning({ id: clients.id });
    clientId = c.id;
    await db.insert(clientAliases).values({ clientId, kind: "name", value: n }).onConflictDoNothing();
    await audit("client_created", me.email, { clientId, name: f.name, from: "drive_folder" });
  } else await addServices(clientId, await servicesFor(f.rootId));
  await rememberDomain(clientId, f.domain);
  await db.update(driveFolders).set({ status: "mapped", clientId }).where(eq(driveFolders.folderId, folderId));
}

// A website found in the folder becomes a domain alias, so files mentioning it match this client later.
async function rememberDomain(clientId: string, domain: string | null) {
  if (domain) await db.insert(clientAliases).values({ clientId, kind: "domain", value: domain }).onConflictDoNothing();
}

export async function mapFolderAction(form: FormData) {
  const me = await requireEmployee();
  const folderId = str(form, "folderId"), clientId = str(form, "clientId");
  if (!clientId) redirect("/ingest/drive?error=pick");
  const [f] = await db.select({ rootId: driveFolders.rootId, domain: driveFolders.domain }).from(driveFolders).where(eq(driveFolders.folderId, folderId)).limit(1);
  await db.update(driveFolders).set({ status: "mapped", clientId }).where(eq(driveFolders.folderId, folderId));
  await addServices(clientId, await servicesFor(f?.rootId ?? null));
  await rememberDomain(clientId, f?.domain ?? null);
  await audit("drive_folder_mapped", me.email, { folderId, clientId });
  done();
}

export async function newClientFromFolderAction(form: FormData) {
  const me = await requireEmployee();
  await newClientFor(str(form, "folderId"), me);
  done();
}

export async function ignoreFolderAction(form: FormData) {
  await requireEmployee();
  await db.update(driveFolders).set({ status: "ignored", clientId: null }).where(eq(driveFolders.folderId, str(form, "folderId")));
  done();
}

// Many folders at once: every checked folder becomes a client, or is ignored.
export async function bulkFoldersAction(form: FormData) {
  const me = await requireEmployee();
  const ids = form.getAll("folderIds").map(String).filter(Boolean);
  if (!ids.length) redirect("/ingest/drive?error=none_checked");
  if (str(form, "op") === "ignore") {
    await db.update(driveFolders).set({ status: "ignored", clientId: null }).where(and(inArray(driveFolders.folderId, ids), eq(driveFolders.status, "pending")));
  } else {
    for (const id of ids) await newClientFor(id, me);
  }
  await audit("drive_folders_bulk", me.email, { op: str(form, "op"), count: ids.length });
  done();
  redirect(`/ingest/drive?bulk=${ids.length}`);
}

export async function resetFolderAction(form: FormData) {
  await requireEmployee();
  await db.update(driveFolders).set({ status: "pending", clientId: null }).where(eq(driveFolders.folderId, str(form, "folderId")));
  done();
}

// ---------- sync ----------

export async function syncNowAction() {
  await requireEmployee();
  const r = await syncDrive({ budgetMs: 50_000 });
  done();
  redirect(`/ingest/drive?${r.ok ? `synced=${r.added + r.updated}${r.more ? "&more=1" : ""}` : `error=${encodeURIComponent(r.reason)}`}`);
}

export async function disconnectDriveAction() {
  const me = await requireEmployee();
  // Disconnecting stops the sync; what was already ingested stays. Removing it is a separate decision.
  await db.delete(connections).where(eq(connections.provider, "google_drive"));
  await db.delete(driveFolders);
  await db.delete(driveFiles);
  await audit("drive_disconnected", me.email, {});
  done();
  redirect("/ingest/drive");
}
