interface Window {
  electronAPI?: {
    quitApp(): void;
    selectProjectFolder(): Promise<string | null>;
  };
}
