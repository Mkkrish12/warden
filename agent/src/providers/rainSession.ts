import {
  constants,
  createDecipheriv,
  publicEncrypt,
  randomUUID,
} from "node:crypto";

/**
 * Rain sandbox RSA public key. A fresh session secret is encrypted under this
 * key for every card creation; Rain uses the session to encrypt the PAN/CVC it
 * returns, so only we can read them.
 */
const RAIN_SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCAP192809jZyaw62g/eTzJ3P9H
+RmT88sXUYjQ0K8Bx+rJ83f22+9isKx+lo5UuV8tvOlKwvdDS/pVbzpG7D7NO45c
0zkLOXwDHZkou8fuj8xhDO5Tq3GzcrabNLRLVz3dkx0znfzGOhnY4lkOMIdKxlQb
LuVM/dGDC9UpulF+UwIDAQAB
-----END PUBLIC KEY-----`;

export interface RainSession {
  /** Sent as the `sessionid` header. */
  sessionId: string;
  /** 32-char hex. Held in memory only — never logged, never persisted. */
  secretKey: string;
}

/**
 * Mint a one-shot session. Generated fresh before every card creation, so a
 * leaked session can only ever expose a single card's details.
 */
export function createRainSession(): RainSession {
  const secretKey = randomUUID().replace(/-/g, "");
  const secretKeyBase64 = Buffer.from(secretKey, "hex").toString("base64");

  const encrypted = publicEncrypt(
    {
      key: RAIN_SANDBOX_PUBLIC_KEY,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(secretKeyBase64, "utf-8"),
  );

  return { sessionId: encrypted.toString("base64"), secretKey };
}

const GCM_TAG_LENGTH = 16;

/**
 * Decrypt a card secret (PAN or CVC) returned by Rain.
 *
 * AES-128-GCM: the 16-byte auth tag is appended to the ciphertext, so it has to
 * be split off and supplied separately before decryption.
 */
export function decryptSecret(
  base64Secret: string,
  base64Iv: string,
  secretKey: string,
): string {
  const secret = Buffer.from(base64Secret, "base64");
  const iv = Buffer.from(base64Iv, "base64");
  const key = Buffer.from(secretKey, "hex");

  const ciphertext = secret.subarray(0, -GCM_TAG_LENGTH);
  const authTag = secret.subarray(-GCM_TAG_LENGTH);

  const decipher = createDecipheriv("aes-128-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext).toString("utf-8").trim();
}
