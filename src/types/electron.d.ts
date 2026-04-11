export {};

declare global {
  interface Window {
    desktop: {
      getInfo: () => Promise<{
        isElectron: boolean;
        platform: string;
        version: string;
      }>;
      openExternal: (url: string) => Promise<boolean>;
    };
  }
}
