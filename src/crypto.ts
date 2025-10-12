import * as openpgp from "openpgp";

export async function encrypt(text: string, password: string): Promise<string> {
  const message = await openpgp.createMessage({ text });
  const encrypted = await openpgp.encrypt({
    message,
    passwords: [password],
    format: "armored",
  });
  return encrypted.toString();
}

export async function decrypt(
  encryptedText: string,
  password: string,
): Promise<string> {
  try {
    const message = await openpgp.readMessage({
      armoredMessage: encryptedText,
    });
    const decrypted = await openpgp.decrypt({
      message,
      passwords: [password],
      format: "utf8",
    });
    return decrypted.data.toString();
  } catch (error) {
    throw new Error("Failed to decrypt: Invalid password or corrupted data");
  }
}

export function isEncrypted(text: string): boolean {
  return (
    text.startsWith("-----BEGIN PGP MESSAGE-----") &&
    text.includes("-----END PGP MESSAGE-----")
  );
}
