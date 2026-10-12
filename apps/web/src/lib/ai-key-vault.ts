import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function masterKey() {
  const value = process.env.AI_KEY_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("Serwer wymaga AI_KEY_ENCRYPTION_KEY (32 bajty zapisane jako 64 znaki hex).");
  }
  return Buffer.from(value, "hex");
}
export function encryptUserKey(value: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
}
export function decryptUserKey(value: string, userId: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Nieprawidłowy zapis klucza AI.");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
