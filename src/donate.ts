/**
 * Поддержать Hallway: программа открывает только этот короткий адрес на сайте, а сайт уже
 * перенаправляет на страницу оплаты — так сервис можно сменить без обновления программы.
 * QR-код этого адреса лежит готовым в src/assets/donate-qr.svg (npm run qr).
 */
export const DONATE_URL = 'https://grigoriapps.com/go/hallway-donate'

/** Адрес без протокола — чтобы его можно было набрать вручную */
export const DONATE_URL_SHORT = DONATE_URL.replace(/^https:\/\//, '')
