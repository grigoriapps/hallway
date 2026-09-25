// Набор смайликов для панели выбора. Только эмодзи версии ≤ 12.0: их умеет рисовать
// Segoe UI Emoji в Windows 10, так что у собеседника на Windows не будет пустых квадратиков.
// Флаги стран не включены: Windows показывает вместо них буквы.

import type { MessageKey } from './i18n'

export interface EmojiCategory {
  id: string
  /** ключ перевода названия раздела: emoji.<id> */
  titleKey: MessageKey
  icon: string
  emojis: string[]
}

/** Одиночным символам с текстовым видом по умолчанию (☀ ✌ ❤) добавляем U+FE0F, чтобы они были цветными */
function normalize(emoji: string): string {
  return Array.from(emoji).length === 1 && !/\p{Emoji_Presentation}/u.test(emoji) ? emoji + '️' : emoji
}

function list(source: string): string[] {
  return [...new Set(source.trim().split(/\s+/).map(normalize))]
}

export const DEFAULT_RECENT = list('😂 ❤️ 👍 😊 🔥 🙏 😭 😍 🎉 👏 🤔 😎 👌 💯 😅 🙌')

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'fun',
    titleKey: 'emoji.fun',
    icon: '🔥',
    emojis: list(`
      💀 🤡 🗿 👀 🔥 💯 🤯 😳 🥴 🥳 😎 🤪 🤠 😈 👻 👽 🤖 🙈 🙉 🙊 🐸 🍿 🎯 🎰 🚀 🥊
      🧠 🦄 🌚 🌝 ⚡ ✨ 🎃 🤝 👑 💩 🎉 🤷 🤦 🙏 💪 ☕
    `)
  },
  {
    id: 'smileys',
    titleKey: 'emoji.smileys',
    icon: '😀',
    emojis: list(`
      😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑
      🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵
      🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖
      😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻
      😼 😽 🙀 😿 😾 🙈 🙉 🙊
    `)
  },
  {
    id: 'people',
    titleKey: 'emoji.people',
    icon: '👋',
    emojis: list(`
      👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐
      🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 🦷 👀 👁️ 👅 👄 💋 👶 🧒 👦 👧 🧑 👱 👨
      🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 👷 🤴 👸 👳 🧕 🤵 👰 🤰
      👼 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🏃 💃 🕺 👯 🧖 🧘 🏄 🚴 🤸 🤹 👫
      👬 👭 💏 💑 👪
    `)
  },
  {
    id: 'hearts',
    titleKey: 'emoji.hearts',
    icon: '❤️',
    emojis: list(`
      ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💯 💢 💥 💫 💦 💨
      💬 🗨️ 🗯️ 💭 💤 🔥 ✨ 🌟 ⭐ ⚡ 🎉 🎊 🎈 🎁 🏆 👑
    `)
  },
  {
    id: 'animals',
    titleKey: 'emoji.animals',
    icon: '🐻',
    emojis: list(`
      🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗
      🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳
      🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🐄 🐎 🐖 🐑 🦙 🐐 🦌 🐕 🐩 🐈 🐓 🦃
      🦚 🦜 🦢 🦩 🐇 🦝 🦨 🦡 🦦 🦥 🐁 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌷
      🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌚 🌙 🌎 🪐 ☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 🌈 ☔ 🌊
    `)
  },
  {
    id: 'food',
    titleKey: 'emoji.food',
    icon: '🍔',
    emojis: list(`
      🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄
      🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮
      🌯 🥗 🥘 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥠 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂
      🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾
      🧊 🍴 🍽️
    `)
  },
  {
    id: 'activity',
    titleKey: 'emoji.activity',
    icon: '⚽',
    emojis: list(`
      ⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🥍 🏏 ⛳ 🏹 🎣 🤿 🥊 🥋 🛹 🛷 ⛸️ 🎿 🏆
      🥇 🥈 🥉 🏅 🎖️ 🎫 🎟️ 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮
      🎰 🧩 🎁 🎈 🎀 🎃 🎆 🎇 🧨 🎊 🎉
    `)
  },
  {
    id: 'travel',
    titleKey: 'emoji.travel',
    icon: '🚗',
    emojis: list(`
      🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🚨 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬
      🚀 🛸 🚁 🛶 ⛵ 🚤 🛳️ 🚢 ⚓ ⛽ 🚧 🚦 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️
      🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🏠 🏡 🏢 🏬 🏥 🏦 🏨 🏪 🏫 💒 🏛️ ⛪ 🌅 🌄 🌠 🎑 🏞️ 🌆 🌇
      🌃 🌌 🌉 🌁
    `)
  },
  {
    id: 'objects',
    titleKey: 'emoji.objects',
    icon: '💡',
    emojis: list(`
      ⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ ⏰ ⏳ ⌛ 📡 🔋 🔌 💡 🔦
      🕯️ 🧯 💸 💵 💰 💳 💎 ⚖️ 🧰 🔧 🔨 🛠️ ⛏️ 🔩 ⚙️ 🧱 🧲 💣 🛡️ 🔮 🧿 🔭 🔬 💊 💉 🩹
      🧬 🦠 🧪 🌡️ 🧹 🧺 🧻 🧼 🧽 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 ✉️ 📩 📦 🏷️ 📜 📄 📊 📈
      📉 🗒️ 📅 📆 🗂️ 📁 📂 📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗑️ 🔒 🔓 🔐 🖊️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍
      🔎 📚 📖 🔖
    `)
  },
  {
    id: 'symbols',
    titleKey: 'emoji.symbols',
    icon: '🔣',
    emojis: list(`
      ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ❓ ❔ ❕ ❗ ‼️ ⁉️ 💯 🚫 ⛔ ⭕ 🛑 ⚠️ ♻️ 🔰 ✳️ ❇️ ✴️
      🆗 🆕 🆒 🆓 🆙 🆘 🔝 🔜 🔙 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ 🔀 🔁 🔂 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️
      ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ 🔄 🎵 🎶 💲 ©️ ®️ ™️ 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩
      🟦 🟪 🟫 ⬛ ⬜ 🔶 🔷 🔸 🔹 🏁 🚩 🏴 🏳️
    `)
  }
]
