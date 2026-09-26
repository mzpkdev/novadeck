interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface Window {
  readonly novadeck?: Readonly<{
    apiUrl: string
    getRuntimeConnection?: () => Promise<{ url: string; token: string }>
  }>
}
