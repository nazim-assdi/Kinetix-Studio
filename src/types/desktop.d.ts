export {};

declare global {
  interface Window {
    kinetixDesktop?: {
      hasGeminiApiKey: () => Promise<boolean>;
      saveGeminiApiKey: (key: string) => Promise<boolean>;
      removeGeminiApiKey: () => Promise<boolean>;
    };
  }
}
