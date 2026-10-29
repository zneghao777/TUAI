export type PaletteId = 'forest' | 'dawn' | 'mono'
export const palettes: { id: PaletteId; name: string; light: string; dark: string }[] = [
  { id: 'forest', name: '绿色', light: '#58786d', dark: '#a9c8bb' },
  { id: 'dawn', name: '晨曦', light: '#155dfc', dark: '#155dfc' },
  { id: 'mono', name: '纯白', light: '#343434', dark: '#ededed' },
]
// File identity is independent of the product palette. Dark mode adjusts luminance only.
const files: Record<string, string> = {
  pdf: '#c53942',
  word: '#2865bd',
  excel: '#238252',
  ppt: '#c55c25',
  image: '#8953b7',
  video: '#aa467d',
  markdown: '#667080',
  html: '#ce572e',
  folder: '#a58125',
  other: '#687782',
  code: '#6261bf',
  angular: '#c43c49',
  c: '#4678a4',
  clojure: '#4b8951',
  cmake: '#456b9d',
  cpp: '#496dc0',
  csharp: '#7751ad',
  css: '#7056bc',
  dart: '#268ba6',
  docker: '#267fab',
  elixir: '#8254aa',
  env: '#92832a',
  erlang: '#ac496a',
  flutter: '#2785b4',
  git: '#cd573b',
  go: '#288c9d',
  graphql: '#b3438a',
  haskell: '#7c659d',
  ini: '#687d8f',
  java: '#b86829',
  javascript: '#9b7a15',
  json: '#928121',
  kotlin: '#9b5db0',
  lua: '#5669b8',
  makefile: '#77882f',
  node: '#50883b',
  'objective-c': '#4678a4',
  perl: '#617e9f',
  php: '#7675ac',
  powershell: '#3b70b7',
  protobuf: '#657d87',
  python: '#477caa',
  r: '#4275ae',
  react: '#20869c',
  ruby: '#b64048',
  rust: '#a86442',
  scala: '#b84148',
  shell: '#58833e',
  solidity: '#777287',
  sql: '#3a82a0',
  svelte: '#c65c35',
  swift: '#cc5b36',
  toml: '#9e6259',
  typescript: '#3178c6',
  vue: '#348865',
  wasm: '#7954b6',
  xml: '#b76c36',
  yaml: '#ad536b',
  zig: '#a97d25',
}
export function fileColor(id: string, dark = false): string | undefined {
  if (!id.startsWith('file-')) return undefined
  const color = files[id.slice(5)]
  if (!color) return undefined
  if (!dark) return color
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(v + (255 - v) * 0.35)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
export function exportColor(id: string, palette: PaletteId, dark: boolean) {
  return fileColor(id, dark) ?? palettes.find((p) => p.id === palette)![dark ? 'dark' : 'light']
}
