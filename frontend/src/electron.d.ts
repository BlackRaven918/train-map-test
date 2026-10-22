interface Window {
  electronAPI?: {
    quitApp(): void;
    selectProjectFolder(): Promise<string | null>;
    openProjectFile?(): Promise<string | null>;
    saveProjectFile?(name: string): Promise<string | null>;
  };
}
