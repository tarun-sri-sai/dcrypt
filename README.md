# DCrypt v4.2.1

DCrypt is a secrets editor extension for VS Code that offers the flexibility of plaintext files with the added security of on-the-fly encryption using OpenPGP.

## Features

- Create a new file in your working directory with the extension `.pgp` or `.asc`.
- The editor may ask you a password to encrypt and decrypt the file contents.
- Type in your secrets (or literally any plaintext content) and the contents will be saved to the file, completely encrypted.
- You will be editing the text completely in-memory, no unencrypted data is written to the disk.

## What's New in v4.2.0

- You can now use GPG keys available through the `gpg` command on your system with the setting `dcrypt.useGpgKey`.
