import * as vscode from "vscode";
import { DcryptTextEditorProvider } from "./dcryptEditor.js";

const passwordStore = new Map<string, string[]>();

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    DcryptTextEditorProvider.register(context, passwordStore),
  );
}

export function deactivate() {
  passwordStore.clear();
}
