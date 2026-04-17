interface ImportMeta {
  readonly env: {
    readonly VITE_API_BASE_URL?: string;
    readonly [key: string]: string | boolean | undefined;
  };
}
