# Changelog

**English** · [Русский](CHANGELOG.ru.md)

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.3] — 2026-09-30

### Added

- **Reminders about unread messages.** A single sound is easy to miss — headphones off, quiet
  speakers, the window hidden in the tray. While a message stays unread, the sound and notification
  repeat every few minutes, at most three times after the latest message. If you were away from the
  computer ("Away" by inactivity or a locked screen), one reminder plays as soon as you are back.
  No reminders in "Do not disturb" or while the Hallway window is in front of you. The interval is in
  "Settings → Notifications → Remind about unread messages": every 2, 5 (default), 10 or 15 minutes,
  or never.
- **Unread messages are visible on Windows without opening the window:** the tray icon gets a red dot
  (its tooltip shows how many are unread), and so does the Hallway button on the taskbar.

### Fixed

- **"Read" receipts no longer get lost.** Receipts that had not been sent yet lived only in memory: if
  Hallway restarted between a message arriving and being read (for example the computer was turned off
  overnight), or the author was offline at the moment of reading, the author kept seeing a single tick
  forever. Now the queue is kept in `read-receipts.json` and goes out as soon as the author is online.
  The packet format is unchanged, so authors on 1.3.x get the late receipts too. This helps once the
  **reader** has 1.3.3.

## [1.3.2] — 2026-09-29

### Added

- **Support Hallway** — a quiet card in "Settings → About": Hallway is free, and anyone who wants
  to can support its development, choosing the amount themselves. The "Support" button opens
  grigoriapps.com/go/hallway-donate in the browser; the site forwards to the payment page, so the
  service can change without an app update. Next to it is a QR code of the same address for paying
  from a phone when the work computer has no internet. The QR code is a ready-made image inside the
  app (`npm run qr` redraws it) — Hallway still makes no internet requests of its own, and the QR
  library is used only while developing. No pop-ups, menu items or reminders.

### Changed

- In "About" the developer link now opens the Hallway page on grigoriapps.com in the interface
  language (for example grigoriapps.com/ru/hallway) and is labelled **grigoriapps.com/hallway**.

## [1.3.1] — 2026-09-24

### Added

- **Two new interface languages: German (Deutsch) and Spanish (Español).** Everything is translated:
  the window, the app menu, the tray, notifications, system dialogs and the "What's new" window.
  German uses the formal «Sie»; Spanish uses «tú» in a neutral variant that reads naturally both in
  Spain and in Latin America. Times use the 24-hour clock, dates use month names in the chosen language.
- **On a new installation the language follows the system** if it is one of the five (Русский, English,
  Deutsch, Español, Română); otherwise Russian. People who update keep their language.

### Changed

- Spell checking (Windows) also matches dictionary variants: "de" or "de-DE", "es" or "es-419" —
  whichever the system has. Russian and English dictionaries stay enabled alongside German and Spanish.
- The page language (`lang`) follows the interface language, so screen readers use the right
  pronunciation.
- In "About" the developer is shown as **grigoriapps.com** — a link that opens in the browser.

### Fixed

- The settings window was cut off on the right when the Hallway window was narrower than about
  870 pixels (including the 720×480 minimum size and a large interface scale): hints, the "Save" button,
  the colleagues table and diagnostics disappeared. Now the settings window is never wider than the app
  window, and in a narrow window the tab column is narrower. At normal sizes nothing changes.
- In "Colleagues and versions" a long "last seen …" label (in Romanian, for example) wraps onto a second
  line instead of running off the edge of the table.
- A settings tab now opens scrolled to the top instead of keeping the previous tab's scroll position.

## 1.3.0 — 2026-09-21

We found out why the "online / went offline" lines appeared unreliably (the logs showed that in the
morning the app woke up when colleagues were already online and honestly did not know when they had
arrived) and closed every gap we found. "Message everyone" became an office-wide chat. Plus colleagues'
versions, clearly visible read receipts and a separate sound for private messages, groups and the
Everyone chat.

### Added

- **"What's new" window.** On the first launch after an update a short overview of the version's news
  opens — no technical details, in the interface language. It is shown once; open it again with
  "Settings → About → What's new". A new installation does not show it.
- **Send queue: a message always gets through.** A private message, a group message and a file offer
  stay in the queue until the recipient confirms them — "not delivered" no longer happens. Retries are
  automatic: as soon as the colleague appears or a connection is established, every 30 seconds and after
  Hallway restarts (the queue is stored with the history). You can also write to people who are offline:
  the message shows a clock and "Will be delivered when Boris comes online", in a group "Not delivered
  yet: Vera". Changed your mind? "Cancel sending" is under the message.
- **The recipient confirms a message only after writing it to disk**, and recognises a repeat of an
  already received message even after a restart — no second sound and no extra unread count. Unsaved
  data is written immediately when the computer shuts down.
- **"Everyone" chat** instead of sending copies. Previously "Message everyone" put a copy of the
  announcement into each of the sender's private chats: with 20 colleagues that was 20 identical
  messages, the previews of private chats in the list were overwritten, and chats were created with
  people you had never written to. Now it is one conversation for everyone, pinned at the top of the
  list on the left; the "Message everyone" button opens it. Anyone can write and reply — everyone sees
  the replies, and the author's name is shown above each message. "typing…" and receipts work as in
  a group: delivered, read by some (who exactly — in the tooltip), read by everyone. Every message has
  "Reply privately": it opens a private chat with the author with the quote already in the input field.
- **Catching up on the Everyone chat.** There is no server, so whoever was offline receives the messages
  of the last 3 days when they come back — from any colleague who has them, even if the author has
  already left. Duplicates are dropped: a message has the same id for everyone. A message written when
  nobody is online is marked with a clock and goes to the first person who appears.
- **Files in the Everyone chat.** The paperclip, drag & drop and pasting a screenshot work in the
  Everyone chat too. Everyone receives a card — name, size, image thumbnail and a SHA-256 checksum —
  and each person downloads the file itself with "Download" when they need it: from the author or,
  if the author is offline, from any colleague who has already downloaded it. After downloading, the
  checksum is verified: a damaged or substituted file is discarded and fetched from the next colleague.
  Only Everyone-chat files that are still in place and unchanged are shared. There is no size limit.
  The author sees one card labelled "Downloaded by N" with the names in the tooltip. Latecomers receive
  the card together with the messages they missed. Colleagues on 1.2 get the file as a regular offer in
  a private chat, without creating copies in the author's private chats.
- **A separate sound for private messages, groups and the Everyone chat** — "Settings → Notifications".
  New sounds "Marimba", "Bubble", "Harp" and a "No sound" option. Defaults: private — "Chime",
  groups — "Drop", Everyone chat — "Marimba". Missed messages delivered later do not ring — they only
  add to the unread counter.
- **The colleague reports their own arrival time.** The presence announcement now says how long the
  client has been online and how long in the current status — as durations, so differences between
  computers' clocks do not matter. The line "online · 7:49" is written with the real arrival time, even
  if your computer was asleep or off at that moment, and only once per arrival.
- **The chat header shows since when:** "Online since 7:49", "Away since 12:26", "Do not disturb since
  14:00". Statuses are not written into the conversation — only into the header.
- **"Settings → Network → Colleagues and versions":** everyone Hallway has seen on the network — system,
  version and status. Versions older than yours are highlighted in red, with a counter "older than yours:
  N" on top. Clients before 1.3 do not report their version and are shown as "before 1.3".
- **Coloured read receipts.** "Delivered" is one pale check mark, "read" is two coloured ones. The colour
  is matched to each theme's bubble: light green on blue, lavender and sand, yellow on "Mint", dark green
  on "Graphite" and "Midnight". In a group there are three levels: delivered to everyone — one pale check,
  read by some — two white checks (who exactly — in the tooltip), read by everyone — two coloured checks.

### Changed

- **Short connection drops are no longer recorded.** If a colleague disappeared without a "bye" and
  came back within 2 minutes, no lines are written. On a real drop, "went offline" appears after
  2 minutes but with the time the connection was lost. Quitting Hallway, shutting down and sleep are
  still recorded immediately.
- The "no more than one line per 15 minutes" rule was removed: because of it the last line could remain
  "went offline" while the person was online.
- **The app no longer appears online while the computer sleeps.** macOS briefly wakes processes even
  during sleep (Power Nap); previously Hallway announced itself and counted timeouts at those moments.
  Now everything is paused until wake-up, and after waking the table of colleagues is rebuilt — everyone
  appears with their own arrival time.
- If macOS sent "going to sleep" without "woke up" (this happened on 21.09), the app no longer goes
  silent for 10 minutes: it considers itself awake as soon as the user presses something, and it
  detects a long process pause on its own.
- "We've been online since …" resets when a network appears that had been absent for a long time
  (a laptop brought into the office). Virtual adapters (Parallels, VirtualBox, Hyper-V) and VPNs do not
  count.
- The preview and time in the list on the left come from the last message or file, not from a service
  line: previously after "online · 9:15" the preview was empty instead of showing the last message.
- The log no longer suggests checking the "Local Network" permission for the subnets of virtual
  adapters — packets do not go there even with the permission granted.

### Fixed

- A thin scrollbar was visible on the right of the input field even though the text fit: the field
  calculated its height without the border and came out 2 pixels shorter than the text. Now the
  scrollbar appears only when the text is longer than the tallest field.

### Fixed (delivery)

- A retry after "no acknowledgement" immediately ran into the connection that was closing and failed
  at once — in effect there was no retry. Because of this a message sent during a brief connection
  glitch was marked "not delivered", although it arrived seconds later.
- False "not delivered" and "not sent: the app was closed" for messages that had actually arrived:
  such messages now stay in the queue and get confirmed on retry.
- A group message is retried to each member with the same packet id: a retry does not create
  a duplicate.

### Changed (Everyone chat)

- The separate "Message everyone" window was removed: the button opens the "Everyone" chat.
- Clearing the Everyone chat history deletes the conversation only on your computer, and what was
  cleared does not come back via catch-up from colleagues.
- Copies of past announcements in private chats stay as they were.

### Compatibility

- Clients 1.2 and older keep working. They do not report the arrival time, "since when" or their
  version: for them the "online / went offline" lines are written only from what your computer saw
  itself, and in the versions summary they are shown as "before 1.3".
- Clients 1.2 do not understand the Everyone chat: the message reaches them the old way — in a private
  chat with the author marked "Everyone online", and their replies reach the author privately. Their
  "read" counts towards the Everyone chat receipts. Files from the Everyone chat reach them as a regular
  offer while they are online. Catching up on missed messages works only between 1.3 clients.

## 1.2.0 — 2026-09-16

A version based on the first days of using 1.1 in the office: groups are brought to a working state,
the conversation is no longer lost together with a group, and the list on the left shows who is
online right now.

### Added

- **Deleting a group.** The group's creator has "Delete the group for everyone…" in the "⋯" menu —
  the group disappears for all members. Everyone else has "Leave group…". Both leaving and deleting
  keep the conversation: it moves to the "Archive".
- **"Archive" section in the list on the left.** It contains the groups you left or deleted and the
  private chats removed from the list via "⋯ → Move out of the list (to archive)". The conversation
  opens read-only, with "Restore to the list" and "Delete permanently…" buttons. A new message from
  a colleague brings a private chat back to the list by itself.
- **The list on the left is divided into sections:** "Groups", "Online", "Offline", "Archive". Each can
  be collapsed and remembers its state; a colleague who is offline shows "last seen at 18:03" — for this
  a `known-peers.json` file appeared next to the history.
- **Coming and going is visible in the conversation** — as unobtrusive centred lines: "online · 9:15",
  "went offline · 18:40". They are written no more than once per 15 minutes per event and only for
  people you already have a conversation with; right after the computer wakes up or the network changes
  there is a pause to avoid false lines. Turn it off in "Settings → Chat and history → Coming and going
  in the chat".
- **Service lines about the group itself:** created, renamed, who was added, who was removed, who left,
  who deleted the group.
- **"typing…" and "Read" in groups.** The header shows "Name is typing…" (or several names), the check
  mark becomes double when everyone has read the message; its tooltip shows who exactly has read it.
- **Files in a group.** The paperclip works in group conversations too: the file is sent to each member
  directly, and one card shows a line per member ("accepted", "declined", "offline") and the overall
  progress. "Retry for them" re-sends the file to those it did not reach.
- **Adding members to an existing group** — "⋯ → Add members…"; there is also "Members…", where you can
  write to a person privately and the creator can remove them from the group. The membership converges
  for all members by a revision number, so changes do not conflict even if someone was offline.

### Changed

- The "Offline" section is expanded by default: that is more familiar in a small office.
- The group's membership and name carry a revision number: an old announcement from a colleague who was
  offline can no longer bring back a deleted group or roll back its name.
- "Read" receipts go only to the message's author, not to the whole group.

### Fixed

- A group could not be deleted — only left, and the conversation disappeared together with the group.
- In a group you could not see that someone was typing, or whether a message had been read.
- An interrupted file transfer to a group is marked as failed for each member it did not reach, rather
  than for the whole card at once.

## 1.1.0 — 2026-09-16

The numbering jumped from 0.2.x straight to 1.1: the app is already in use in the office, and a version
starting with zero looked like a draft. The contents are what was being prepared as 0.2.3; there was no
separate 0.2.3 release.

### Added

- **Groups.** The "Group" button in the sidebar: pick colleagues, give it a name — and the conversation
  goes to everyone at once. There is no server: a message goes to each member over their private
  connection, and the membership is stored by every member and travels with each message, so the group
  appears even for someone who missed the membership announcement. A member who was offline receives
  the membership when they start Hallway. The "⋯" menu in the group header has the member list,
  renaming, search in the conversation, clearing the history and leaving the group (the others see that
  the member left). The author's name is shown above each message.
- "Fun" section in the emoji panel.
- Emoji panel in the "Message everyone" window.
- **Interface language**: Русский, English, Română. Switch it in "Settings → Appearance"; it applies
  immediately, without a restart: windows, the app menu, system dialogs and the tray menu are all
  translated. Spell checking dictionaries follow the chosen language (on macOS the system sets them).

### Changed

- The "Message everyone online" button became a labelled **"Message everyone"** button instead of an
  unclear speaker icon; in the conversation itself the label is now "Everyone online".
- **Start at login is on by default.** On the first launch after an update it is turned on once; if you
  turn it off, the app will not turn it on again.
- **IP addresses were removed from the interface**: the list of colleagues and the chat header show the
  name and system. Your own addresses are still visible in "Settings → Network".
- Chromium interface translations for 44 unused languages were removed from the build (11 are kept):
  the app takes about 40 MB less.
- Emoji panel: tabs wrap onto a second line, nothing is cut off.
- "About" shows the developer **grigoriapps** and the email grigoriapps@gmail.com (it can be selected and
  copied), and the version is shown without a zero patch — "1.1", not "1.1.0".

### Compatibility

- Updating over 0.2.2 keeps the name, settings and the whole conversation history: the data lives in the
  app data folder (`~/Library/Application Support/Hallway`, `%APPDATA%\Hallway`), and the Windows
  installer does not delete it even when the app is uninstalled.
- Groups work between 1.1 clients. A 0.2.2 client shows a group message as a private one — nothing
  breaks, but it will not see the group's members.

## 0.2.2 — 2026-09-16

The first public release. Earlier builds were not published.

### Network

- UDP discovery (port 41234): presence announcements every 3 seconds to `255.255.255.255` and to the
  broadcast address of every subnet, a direct reply to someone else's announcement, a burst of
  announcements at startup — a colleague becomes visible within 1–3 seconds. The IP is taken from the
  socket, not from the packet; if announcements stop for 10 seconds the client is considered gone, and
  a `bye` is sent on quit.
- Direct exchange over TCP (base port 41235; if it is busy, the next free one is used): line-delimited
  JSON, reuse of an established connection in both directions, acknowledgements, retry on disconnect,
  duplicate protection and preserved ordering.
- Reverse connection and "push" as fallbacks when a firewall blocks incoming connections.
- Manual connection by IP address — for networks where broadcast does not pass.
- Recovery after the computer sleeps or the network changes.

### Messages

- Send statuses: sending, delivered, read, error.
- Replying to a message with a quote; clicking the quote jumps to the original.
- "typing…" and "Read" receipts (sending receipts can be turned off).
- Emoji panel: 9 categories, "Frequently used", large display for messages of 1–3 emoji.
- Pasting a screenshot or file from the clipboard, clickable links, spell checking.
- Search in a conversation with highlighting and jumping between matches.
- "Message everyone online" — one announcement to everyone currently online.

### Files

- File transfer of any size: confirmation, progress and speed, cancel from either side, "Open" and
  "Show in folder", drag & drop and a paperclip button.
- Receiving through a temporary `.hallway-part` file, unique names like "name (1).ext", name checks
  (directory traversal, reserved Windows names).
- Image thumbnails are visible before the file is accepted.
- Auto-accept: off / from pinned colleagues / from everyone, with a size limit.

### History and settings

- The conversation is saved to disk (one file per colleague), retention from "do not save" to "forever",
  clearing the whole history or a single chat. Unfinished file offers survive a restart.
- Profile: name, status "Online / Away / Do not disturb"; "Away" is set automatically after N minutes of
  inactivity or when the screen is locked, "Do not disturb" mutes sounds and notifications.
- Appearance: 7 themes plus "Match the system", 5 built-in fonts, interface scale 80–150%, message text
  size, chat background, compact mode.
- A window title bar in the theme colour: on macOS the window buttons are built into the sidebar, on
  Windows the system buttons are drawn over the interface.
- Sounds: a choice of new-message sounds ("Chime", "Birds", "Whistle", "Drop"), a colleague coming online
  and leaving. All sounds are synthesised; there are no sound files in the build.
- Notifications, unread counters, a Dock badge (macOS) and taskbar flashing (Windows).
- Running in the background: tray on Windows, start at login, changing the status from the tray or Dock
  menu.
- Sending with Enter or with ⌘/Ctrl+Enter, searching colleagues and pinning the important ones to the
  top of the list.
- Diagnostics screen: your addresses, ports, the path to the logs. An "About" section with the version and
  a "Copy the details" button.

### Build

- Installers: `.dmg` and `.zip` for Apple Silicon and Intel, `.exe` (NSIS) for Windows x64. The Windows
  installer adds a firewall rule.
- The icon is drawn in code (`npm run icons`); there are no sound or raster assets in the repository.
- The interface runs with `contextIsolation` and `sandbox`, without `nodeIntegration`; networking happens
  only in the main process.
- Tests: unit (`npm run test:unit`) and network tests without Electron (`npm run test:net`).

### Known limitations

- Traffic between computers and the history on disk are not encrypted — the app is meant for a trusted
  local network.
- The builds are not signed with Apple or Microsoft certificates, so the system warns about an unknown
  publisher on first launch (see [README](README.md#download)).
- Works only within the local network; between different subnets you need to add IP addresses manually.
- The Windows part (tray, start at login, system buttons in the title bar) was built and tested on macOS.

[Unreleased]: https://github.com/grigoriapps/hallway/compare/v1.3.3...HEAD
[1.3.3]: https://github.com/grigoriapps/hallway/releases/tag/v1.3.3
[1.3.2]: https://github.com/grigoriapps/hallway/releases/tag/v1.3.2
[1.3.1]: https://github.com/grigoriapps/hallway/releases/tag/v1.3.1
