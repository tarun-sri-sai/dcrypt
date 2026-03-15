import * as vscode from "vscode";
import os from "os";
import path from "path";

export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getPasswordKey(uri: vscode.Uri) {
  let key;
  if (
    vscode.workspace
      .getConfiguration("dcrypt")
      .get<boolean>("askPasswordForFile")
  ) {
    key = uri.toString();
  } else {
    key = os.homedir();
  }

  return [key, path.basename(key)];
}

export function isGpgKeyMode(): boolean {
  return (
    vscode.workspace
      .getConfiguration("dcrypt")
      .get<boolean>("useGpgKey") ?? false
  );
}

export function getGpgConfig(): { gpgKeyId: string; gpgPath: string } {
  const config = vscode.workspace.getConfiguration("dcrypt");
  const gpgKeyId = config.get<string>("gpgKeyId") ?? "";
  const gpgPath = config.get<string>("gpgPath") ?? "gpg";
  return { gpgKeyId, gpgPath };
}
