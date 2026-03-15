import { execFile } from "child_process";

function run(
  command: string,
  args: string[],
  input?: Buffer | string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      command,
      args,
      { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
    if (input !== undefined && proc.stdin) {
      proc.stdin.end(input);
    }
  });
}

export async function gpgVerifyInstalled(gpgPath: string): Promise<void> {
  await run(gpgPath, ["--version"]);
}

export async function gpgDecrypt(
  ciphertext: Buffer,
  gpgPath: string,
): Promise<string> {
  const { stdout } = await run(gpgPath, ["--decrypt", "--batch", "--yes"], ciphertext);
  return stdout;
}

export async function gpgEncrypt(
  plaintext: string,
  recipient: string,
  gpgPath: string,
): Promise<string> {
  const { stdout } = await run(
    gpgPath,
    [
      "--encrypt",
      "--armor",
      "--recipient",
      recipient,
      "--batch",
      "--yes",
      "--trust-model",
      "always",
    ],
    plaintext,
  );
  return stdout;
}
