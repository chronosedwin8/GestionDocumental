/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Única variable pública del cliente: la URL base de la API propia. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
