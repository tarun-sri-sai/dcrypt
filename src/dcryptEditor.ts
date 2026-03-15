import * as vscode from "vscode";
import * as util from "./util.js";
import * as openpgp from "openpgp";
import * as gpg from "./gpg.js";

export class DcryptEditorProvider
  implements vscode.CustomEditorProvider<vscode.CustomDocument>
{
  public readonly onDidChangeCustomDocument: vscode.Event<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  > = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >().event;
  private readonly passwordStore: Map<string, string[]>;
  private readonly context: vscode.ExtensionContext;

  constructor(
    context: vscode.ExtensionContext,
    passwordStore: Map<string, string[]>,
  ) {
    this.context = context;
    this.passwordStore = passwordStore;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const uri = document.uri;
    const fileContent = await vscode.workspace.fs.readFile(uri);
    const useGpg = util.isGpgKeyMode();

    let decryptedContent = "";
    let passwords: string[] = [];
    let gpgKeyId = "";
    let gpgPath = "gpg";

    if (useGpg) {
      const gpgConfig = util.getGpgConfig();
      gpgKeyId = gpgConfig.gpgKeyId;
      gpgPath = gpgConfig.gpgPath;

      if (!gpgKeyId) {
        vscode.window.showErrorMessage(
          "GPG key ID is required. Set \"dcrypt.gpgKeyId\" in your settings.",
        );
        setImmediate(() => webviewPanel.dispose());
        return;
      }

      try {
        await gpg.gpgVerifyInstalled(gpgPath);
      } catch {
        vscode.window.showErrorMessage(
          `GPG is not installed or not found at "${gpgPath}". Install GPG or set "dcrypt.gpgPath" to the correct path.`,
        );
        setImmediate(() => webviewPanel.dispose());
        return;
      }

      if (fileContent.length > 0) {
        try {
          decryptedContent = await gpg.gpgDecrypt(
            Buffer.from(fileContent),
            gpgPath,
          );
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `GPG decryption failed: ${error.message}`,
          );
          setImmediate(() => webviewPanel.dispose());
          return;
        }
      }
    } else {
      const [passwordStoreKey, displayName] = util.getPasswordKey(uri);
      passwords = this.passwordStore.get(passwordStoreKey) ?? [""];
      if (!passwords[0]) {
        passwords = [(await this.promptForPassword(displayName)) ?? ""];
        if (!passwords[0]) {
          vscode.window.showErrorMessage("No password was provided");
          setImmediate(() => webviewPanel.dispose());
          return;
        }
        this.passwordStore.set(passwordStoreKey, passwords);
      }

      if (fileContent.length > 0) {
        try {
          const armoredMessage = new TextDecoder().decode(fileContent);
          decryptedContent = (
            await openpgp.decrypt({
              message: await openpgp.readMessage({ armoredMessage }),
              passwords,
              format: "utf8",
            })
          ).data;
        } catch (error: any) {
          vscode.window.showErrorMessage("Failed to decrypt file");
          this.passwordStore.delete(passwordStoreKey);
          setImmediate(() => webviewPanel.dispose());
          return;
        }
      }
    }

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this.getWebviewContent(webviewPanel.webview);

    const messageListener = webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "ready":
            webviewPanel.webview.postMessage({
              command: "setContent",
              content: decryptedContent,
            });
            break;
          case "save":
            if (useGpg) {
              await this.saveFileGpg(uri, message.text, gpgKeyId, gpgPath);
            } else {
              await this.saveFile(uri, message.text, passwords);
            }
            break;
        }
      },
    );

    webviewPanel.onDidDispose(() => {
      messageListener.dispose();
    });
  }

  private async promptForPassword(
    fileName: string,
  ): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title: "DCrypt File",
      prompt: `Enter password for ${fileName}`,
      password: true,
      ignoreFocusOut: true,
    });
  }

  private async saveFile(
    uri: vscode.Uri,
    text: string,
    passwords: string[],
  ): Promise<void> {
    try {
      const armoredMessage = await openpgp.encrypt({
        message: await openpgp.createMessage({ text }),
        passwords,
        format: "armored",
      });

      await vscode.workspace.fs.writeFile(
        uri,
        new TextEncoder().encode(armoredMessage),
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to save encrypted file: ${error.message}`,
      );
    }
  }

  private async saveFileGpg(
    uri: vscode.Uri,
    text: string,
    recipient: string,
    gpgPath: string,
  ): Promise<void> {
    try {
      const armoredMessage = await gpg.gpgEncrypt(text, recipient, gpgPath);

      await vscode.workspace.fs.writeFile(
        uri,
        new TextEncoder().encode(armoredMessage),
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `GPG encryption failed: ${error.message}`,
      );
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "dcrypt.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "dcrypt.css"),
    );
    const nonce = util.getNonce();

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; 
                                                            style-src ${webview.cspSource} https://cdnjs.cloudflare.com 'unsafe-inline';
                                                            script-src 'nonce-${nonce}' ${webview.cspSource} https://cdnjs.cloudflare.com;
                                                            worker-src blob:;
                                                            font-src ${webview.cspSource} https://cdnjs.cloudflare.com;">
        <title>DCrypt Editor</title>
        <link href="${styleUri}" rel="stylesheet">
      </head>
      <body>
        <div id="editor-container"></div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }

  public saveCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    return Promise.resolve();
  }

  public saveCustomDocumentAs(
    _document: vscode.CustomDocument,
    _destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    return Promise.resolve();
  }

  public revertCustomDocument(
    _document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    return Promise.resolve();
  }

  public backupCustomDocument(
    _document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    return Promise.resolve({
      id: context.destination.toString(),
      delete: () => {},
    });
  }
}
