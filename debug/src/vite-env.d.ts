/// <reference types="vite/client" />

declare module "*.png" {
  const source: string;
  export default source;
}

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
