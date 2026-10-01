import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

// Read-only access to Drive, asked for once by whoever connects the company Drive,
// separately from sign-in so other employees are never asked for it.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API = "https://www.googleapis.com/drive/v3";

export type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; createdTime: string; version?: string; size?: string; parents?: string[] };
// A top folder that holds client folders, and the services its clients get by default.
export type DriveRoot = { id: string; name: string; driveId?: string; services: string[] };
export type DriveConfig = { roots?: DriveRoot[]; driveId?: string; rootFolderId?: string; rootName?: string };

// Reads both shapes: the single-root config from before, and the list of roots.
export function getRoots(cfg: DriveConfig | null | undefined): DriveRoot[] {
  if (!cfg) return [];
  if (cfg.roots) return cfg.roots;
  return cfg.rootFolderId ? [{ id: cfg.rootFolderId, name: cfg.rootName ?? "Drive", driveId: cfg.driveId, services: [] }] : [];
}

export const SERVICE_SETS: Record<string, { label: string; services: string[] }> = {
  seo: { label: "קידום (SEO ו-GEO)", services: ["seo", "geo"] },
  web: { label: "בניית אתרים", services: ["web"] },
  none: { label: "בלי שירות קבוע", services: [] },
};

export const redirectUri = (origin: string) => `${origin}/api/connect/drive/callback`;

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID!, redirect_uri: redirectUri(origin), response_type: "code", scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, hd: "eviltwin.io",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "token request failed");
  return json as { access_token: string; refresh_token?: string; id_token?: string; scope: string };
}

export const exchangeCode = (code: string, origin: string) => tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });

export async function saveConnection(refreshToken: string, accountEmail: string, ownerId: string) {
  const tokenEnc = encrypt(refreshToken);
  await db.insert(connections).values({ provider: "google_drive", tokenEnc, accountEmail, ownerId })
    .onConflictDoUpdate({ target: connections.provider, set: { tokenEnc, accountEmail, ownerId, lastError: null } });
}

export async function getConnection() {
  const [c] = await db.select().from(connections).where(eq(connections.provider, "google_drive")).limit(1);
  return c ?? null;
}

// A fresh access token from the stored refresh token. A revoked grant surfaces as a clear error.
export async function accessToken() {
  const c = await getConnection();
  if (!c?.tokenEnc) throw new Error("Google Drive לא מחובר");
  const t = await tokenRequest({ refresh_token: decrypt(c.tokenEnc), grant_type: "refresh_token" });
  return t.access_token;
}

async function api<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function listSharedDrives(token: string) {
  const r = await api<{ drives: { id: string; name: string }[] }>(token, "/drives", { pageSize: "100" });
  return r.drives ?? [];
}

const FIELDS = "nextPageToken, files(id, name, mimeType, modifiedTime, createdTime, version, size, parents)";

export async function listChildren(token: string, folderId: string, driveId?: string, onlyFolders = false) {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = `'${folderId}' in parents and trashed = false${onlyFolders ? " and mimeType = 'application/vnd.google-apps.folder'" : ""}`;
    const r = await api<{ files: DriveFile[]; nextPageToken?: string }>(token, "/files", {
      q, fields: FIELDS, pageSize: "200", supportsAllDrives: "true", includeItemsFromAllDrives: "true", orderBy: "name",
      ...(driveId ? { corpora: "drive", driveId } : {}), ...(pageToken ? { pageToken } : {}),
    });
    out.push(...(r.files ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

// Folders others shared with this account (client folders often live here, not in a Shared Drive).
export async function listSharedWithMeFolders(token: string) {
  const r = await api<{ files: DriveFile[] }>(token, "/files", {
    q: "sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: "files(id, name, mimeType, modifiedTime, createdTime)", pageSize: "200", orderBy: "name",
  });
  return r.files ?? [];
}

export async function getFolder(token: string, id: string) {
  return api<{ id: string; name: string; mimeType: string; driveId?: string; parents?: string[] }>(token, `/files/${id}`, { fields: "id, name, mimeType, driveId, parents", supportsAllDrives: "true" });
}

// The id out of anything a person pastes: a folder link, a sharing link, or the bare id.
export function folderIdFromLink(s: string) {
  const t = s.trim();
  const m = t.match(/\/folders\/([\w-]{10,})/) ?? t.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(t) ? t : null;
}

export const FOLDER = "application/vnd.google-apps.folder";
// Google's own formats are exported to something the ingestion pipeline already reads.
const EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "text/plain", ext: "txt" },
  "application/vnd.google-apps.presentation": { mime: "text/plain", ext: "txt" },
  "application/vnd.google-apps.spreadsheet": { mime: "text/csv", ext: "csv" },
};

// Only what the brain can read today. Images, video, audio, 3D models and the rest stay in Drive untouched.
const READABLE_EXT = /.(pdf|docx|txt|md|csv|vtt|srt)$/i;
export function isSyncable(f: DriveFile) {
  if (f.mimeType === FOLDER) return false;
  if (f.mimeType.startsWith("application/vnd.google-apps.")) return f.mimeType in EXPORT;
  return READABLE_EXT.test(f.name) || f.mimeType === "application/pdf" || f.mimeType.startsWith("text/");
}

export const driveLink = (id: string) => `https://drive.google.com/open?id=${id}`;

export async function download(token: string, f: DriveFile): Promise<{ bytes: Uint8Array; name: string; type: string }> {
  const exp = EXPORT[f.mimeType];
  const url = exp
    ? `${API}/files/${f.id}/export?${new URLSearchParams({ mimeType: exp.mime, supportsAllDrives: "true" })}`
    : `${API}/files/${f.id}?${new URLSearchParams({ alt: "media", supportsAllDrives: "true" })}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive download ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const name = exp && !f.name.toLowerCase().endsWith(`.${exp.ext}`) ? `${f.name}.${exp.ext}` : f.name;
  return { bytes, name, type: exp?.mime ?? f.mimeType };
}
