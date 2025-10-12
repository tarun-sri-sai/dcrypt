import { parse } from "path";
import * as vscode from "vscode";
import * as util from "./util.js";
import * as crypto from "./crypto.js";

export class DcryptTextEditorProvider
  implements vscode.CustomTextEditorProvider
{
  static activeEditor: DcryptEditor | undefined;
  private static readonly viewType = "editor.dcrypt";
  private passwordStore: Map<string, string[]>;

  public static register(
    context: vscode.ExtensionContext,
    passwordStore: Map<string, string[]>,
  ): vscode.Disposable {
    const provider = new DcryptTextEditorProvider(context, passwordStore);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      DcryptTextEditorProvider.viewType,
      provider,
    );
    return providerRegistration;
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    passwordStore: Map<string, string[]>,
  ) {
    this.passwordStore = passwordStore;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const editor = new DcryptEditor(
      webviewPanel,
      this.context,
      this.passwordStore,
    );
    await editor.edit(document);
    DcryptTextEditorProvider.activeEditor = editor;

    const onDidChangeViewState = webviewPanel.onDidChangeViewState((e) => {
      DcryptTextEditorProvider.activeEditor = e.webviewPanel.active
        ? editor
        : undefined;
    });

    webviewPanel.onDidDispose(onDidChangeViewState.dispose);
  }
}

class DcryptEditor {
  private passwordStore: Map<string, string[]>;

  constructor(
    readonly webviewPanel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    passwordStore: Map<string, string[]>,
  ) {
    this.passwordStore = passwordStore;

    webviewPanel.webview.options = {
      enableScripts: true,
    };
  }

  public async edit(document: vscode.TextDocument) {
    const fileContent = document.getText();
    const [key, keyName] = util.getPasswordKey(document.uri);
    let password = this.passwordStore.get(key)?.[1];

    if (fileContent && !password) {
      password = await this.promptForPassword(`Enter password for ${keyName}`);
      if (!password) {
        return;
      }
      this.passwordStore.set(key, [keyName, password]);
    }

    let decryptedContent = "";
    if (fileContent) {
      try {
        if (crypto.isEncrypted(fileContent)) {
          decryptedContent = await crypto.decrypt(fileContent, password!);
        } else {
          decryptedContent = fileContent;
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          "Failed to decrypt: Invalid password or corrupted data",
        );
        this.passwordStore.delete(key);
        return;
      }
    }

    const onDidReceiveMessage = this.webviewPanel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.command) {
          case "save":
            if (!password) {
              password = await this.promptForPassword(
                `Set password for ${keyName}`,
              );
              if (!password) {
                return;
              }
              this.passwordStore.set(key, [keyName, password]);
            }

            const encrypted = await crypto.encrypt(msg.text, password);
            await this.updateTextDocument(document, encrypted);
            await document.save();
            return;

          case "ready":
            this.webviewPanel.webview.postMessage({
              command: "setContent",
              content: decryptedContent,
            });
            return;
        }
      },
    );

    this.webviewPanel.webview.html = await this.getHtmlForWebview({
      content: "",
      contentType: "text/plain",
      syncTheme: true,
      name: parse(document.uri.fsPath).name,
    });

    this.webviewPanel.onDidDispose(onDidReceiveMessage.dispose);
  }

  private updateTextDocument(
    document: vscode.TextDocument,
    content: string,
  ): Thenable<boolean> {
    const edit = new vscode.WorkspaceEdit();

    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      content,
    );

    return vscode.workspace.applyEdit(edit);
  }

  private async promptForPassword(prompt: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt,
      password: true,
      ignoreFocusOut: true,
      placeHolder: "Enter password",
    });
  }

  private async getHtmlForWebview(
    data: Record<string, unknown>,
  ): Promise<string> {
    const htmlFile = vscode.Uri.joinPath(
      this.context.extensionUri,
      "public",
      "index.html",
    );

    let uint8Array = await vscode.workspace.fs.readFile(htmlFile);
    let html = Uint8ArrayToStr(uint8Array);

    const base64Config = btoa(JSON.stringify(data));
    html = html.replace("{data-dcrypt}", base64Config);

    return html;
  }
}

// http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt

/* utf.js - UTF-8 <=> UTF-16 convertion
 *
 * Copyright (C) 1999 Masanao Izumo <iz@onicos.co.jp>
 * Version: 1.0
 * LastModified: Dec 25 1999
 * This library is free.  You can redistribute it and/or modify it.
 */

function Uint8ArrayToStr(array: Uint8Array) {
  var out, i, len, c;
  var char2, char3;

  out = "";
  len = array.length;
  i = 0;
  while (i < len) {
    c = array[i++];
    switch (c >> 4) {
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        // 0xxxxxxx
        out += String.fromCharCode(c);
        break;
      case 12:
      case 13:
        // 110x xxxx   10xx xxxx
        char2 = array[i++];
        out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
        break;
      case 14:
        // 1110 xxxx  10xx xxxx  10xx xxxx
        char2 = array[i++];
        char3 = array[i++];
        out += String.fromCharCode(
          ((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0),
        );
        break;
    }
  }

  return out;
}
