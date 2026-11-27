import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kinetixDesktop', {
  hasGeminiApiKey: (): Promise<boolean> => ipcRenderer.invoke('kinetix:has-gemini-key'),
  saveGeminiApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('kinetix:save-gemini-key', key),
  removeGeminiApiKey: (): Promise<boolean> => ipcRenderer.invoke('kinetix:remove-gemini-key'),
});
