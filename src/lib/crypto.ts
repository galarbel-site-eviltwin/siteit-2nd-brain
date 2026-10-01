import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for tokens at rest. TOKEN_KEY is 32 random bytes, base64, and lives only in env.
function key() {
  const k = Buffer.from(process.env.TOKEN_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("TOKEN_KEY must be 32 bytes of base64");
  return k;
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decrypt(token: string) {
  const [iv, tag, body] = token.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}
