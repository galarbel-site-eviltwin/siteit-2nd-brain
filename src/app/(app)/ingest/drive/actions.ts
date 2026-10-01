"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clientAliases, clients, connections, driveFiles, driveFolders } from "@/lib/db/schema";
import { audit } from "@/lib/employees";
import { normName } from "@/lib/ingest/match";
import { accessToken, FOLDER, folderIdFromLink, getFolder } from "@/lib/drive/google";
import { syncDrive } from "@/lib/drive/sync";
import { requireEmployee } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const done = () => { revalidatePath("/ingest/drive"); revalidatePath("/ingest"); };

export async function chooseRootAction(form: FormData) {
  const me = await requireEmployee();
  const driveId = str(form, "driveId"), rootFolderId = str(form, "rootFolderId"), rootName = str(form, "rootName");
  if (!rootFolderId) redirect("/ingest/drive");
  await db.update(connections).set({ config: { driveId: driveId || undefined, rootFolderId, rootName } }).where(eq(connections.provider, "google_drive"));
  // A different root means different client folders: start the mapping fresh.
  await db.delete(driveFolders);
  await audit("drive_root_set", me.email, { rootName });
  await syncDrive({ budgetMs: 40_000, maxFiles: 0 });
  done();
  redirect("/ingest/drive");
}

export async function chooseByLinkAction(form: FormData) {
  await requireEmployee();
  const id = folderIdFromLink(str(form, "link"));
  if (!id) redirect("/ingest/drive?error=link");
  let folder: Awaited<ReturnType<typeof getFolder>>;
  try {
    folder = await getFolder(await accessToken(), id);
  } catch {
    redirect("/ingest/drive?error=link_access");
  }
  if (folder.mimeType !== FOLDER) redirect("/ingest/drive?error=not_folder");
  const f = new FormData();
  f.set("driveId", folder.driveId ?? ""); f.set("rootFolderId", folder.id); f.set("rootName", folder.name);
  await chooseRootAction(f);
}

export async function mapFolderAction(form: FormData) {
  const me = await requireEmployee();
  const folderId = str(form, "folderId"), clientId = str(form, "clientId");
  if (!clientId) redirect("/ingest/drive?error=pick");
  await db.update(driveFolders).set({ status: "mapped", clientId }).where(eq(driveFolders.folderId, folderId));
  await audit("drive_folder_mapped", me.email, { folderId, clientId });
  done();
}

export async function newClientFromFolderAction(form: FormData) {
  const me = await requireEmployee();
  const folderId = str(form, "folderId");
  const [f] = await db.select().from(driveFolders).where(eq(driveFolders.folderId, folderId)).limit(1);
  if (!f) return;
  const [c] = await db.insert(clients).values({ name: f.name, ownerId: me.id, status: "active" }).returning({ id: clients.id });
  await db.insert(clientAliases).values({ clientId: c.id, kind: "name", value: normName(f.name) }).onConflictDoNothing();
  await db.update(driveFolders).set({ status: "mapped", clientId: c.id }).where(eq(driveFolders.folderId, folderId));
  await audit("client_created", me.email, { clientId: c.id, name: f.name, from: "drive_folder" });
  done();
}

export async function ignoreFolderAction(form: FormData) {
  await requireEmployee();
  await db.update(driveFolders).set({ status: "ignored", clientId: null }).where(eq(driveFolders.folderId, str(form, "folderId")));
  done();
}

export async function resetFolderAction(form: FormData) {
  await requireEmployee();
  await db.update(driveFolders).set({ status: "pending", clientId: null }).where(eq(driveFolders.folderId, str(form, "folderId")));
  done();
}

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
