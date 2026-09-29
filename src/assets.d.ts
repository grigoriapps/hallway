// Картинки, импортируемые в интерфейсе, Vite превращает в URL файла
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
