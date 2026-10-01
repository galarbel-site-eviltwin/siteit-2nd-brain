import { eq } from "drizzle-orm";
import { db } from "./db";
import { items } from "./db/schema";
import { removeFile } from "./storage";

// Removes an item, its chunks (cascade) and its stored original.
export async function deleteItem(itemId: string) {
  const [it] = await db.select({ path: items.storagePath }).from(items).where(eq(items.id, itemId)).limit(1);
  if (!it) return;
  if (it.path) await removeFile(it.path);
  await db.delete(items).where(eq(items.id, itemId));
}
