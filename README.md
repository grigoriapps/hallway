# Hallway

**English** · [Русский](README.ru.md)

A serverless messenger for the office local network. Hallway clients find each other on their own
(UDP broadcast) and talk directly (TCP): messages, groups, an office-wide chat and files of any size.
No server, no accounts, no internet. macOS and Windows. Free and open source ([MIT](LICENSE)).

## Download

Installers are on the [Releases](https://github.com/grigoriapps/hallway/releases/latest) page:

- macOS, Apple Silicon (M1 and later): `Hallway-<version>-mac-arm64.dmg`
- macOS, Intel: `Hallway-<version>-mac-x64.dmg`
- Windows 10/11, x64: `Hallway-<version>-win-x64.exe`

Each release has a `SHA256SUMS.txt`. To check that a file was not tampered with, run
`shasum -a 256 Hallway-*.dmg` on macOS or `Get-FileHash Hallway-*.exe` in PowerShell on Windows
and compare the result with the line in that file.

The builds are not signed with Apple or Microsoft certificates, so the system warns about an unknown
developer on first launch:

- **macOS:** right-click the app → **Open**. If macOS says the app is "damaged" (happens after
  downloading or AirDrop), run `xattr -cr /Applications/Hallway.app`. Allow **Local Network** access
  when asked — without it Hallway sees nobody.
- **Windows:** in the SmartScreen window click **More info → Run anyway**. The installer adds
  a Windows Firewall rule for Hallway; keep the network profile set to **Private**.

## Privacy

- **Hallway never connects to the internet.** There are no servers, accounts, telemetry, analytics
  or auto-updates. All traffic stays inside your local network: UDP port 41234 (finding colleagues)
  and TCP port 41235 (messages and files). A browser opens only when you click a link yourself.
- **Your chat history stays on your computers** — in the app data folder
  (`~/Library/Application Support/Hallway` on macOS, `%APPDATA%\Hallway` on Windows).
- **Few third-party components:** Electron, React and four fonts (Inter, JetBrains Mono, Nunito,
  PT Serif), all bundled into the installer — nothing is downloaded at runtime. Everything else is
  the code in this repository.
- **Honest limitation:** network traffic and the history on disk are not encrypted. Hallway is meant
  for a trusted office network.

To verify it yourself: Hallway works on a computer with no internet at all, and its connections are
visible in LuLu or Little Snitch (macOS), Windows Firewall or Wireshark.

## Features

- Automatic "who's online" list — colleagues appear 1–3 seconds after launch
- Private chats, **groups** and an **office-wide chat**; missed office-chat messages are delivered
  for the last 3 days by anyone who has them
- **Send queue**: a message waits until the recipient confirms it and goes out as soon as they are
  back — even after a restart. You can write to people who are offline
- Files of any size with progress and cancel, drag & drop, pasting screenshots from the clipboard,
  image thumbnails
- Delivered / read receipts, "typing…", replies with quotes, search in a conversation
- Statuses (Online / Away / Do not disturb), sounds per chat type, notifications, unread badges
- 7 themes plus "follow system", 5 fonts, interface scale, compact mode
- Interface languages: English, Русский, Deutsch, Español, Română
- Manual connection by IP address for networks where broadcast does not pass

## Build from source

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev          # run in development mode
npm run typecheck
npm test             # unit tests + network tests (two clients on real sockets)
npm run dist:mac     # .dmg and .zip for Apple Silicon and Intel (macOS only)
npm run dist:win     # .exe installer (NSIS, x64)
```

Installers are written to `release/<version>/`.

Detailed documentation — the network protocol, data files, `config.json` settings and troubleshooting —
is in [README.ru.md](README.ru.md) (in Russian), and the change log is in [CHANGELOG.md](CHANGELOG.md)
(in Russian).

## License

[MIT](LICENSE) — © 2026 grigoriapps · [grigoriapps.com](https://grigoriapps.com) ·
grigoriapps@gmail.com
