import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name: string, settings: any) => ipcRenderer.invoke('projects:create', name, settings),
    update: (id: number, name: string, settings: any) => ipcRenderer.invoke('projects:update', id, name, settings),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id),
    get: (id: number) => ipcRenderer.invoke('projects:get', id),
  },
  templates: {
    get: (projectId: number) => ipcRenderer.invoke('templates:get', projectId),
    save: (template: any) => ipcRenderer.invoke('templates:save', template),
  },
  students: {
    list: (projectId: number) => ipcRenderer.invoke('students:list', projectId),
    import: (projectId: number, students: any[]) => ipcRenderer.invoke('students:import', projectId, students),
    updatePhoto: (id: number, photoPath: string) => ipcRenderer.invoke('students:updatePhoto', id, photoPath),
    clear: (projectId: number) => ipcRenderer.invoke('students:clear', projectId),
  },
  exports: {
    list: (projectId: number) => ipcRenderer.invoke('exports:list', projectId),
    create: (exportData: any) => ipcRenderer.invoke('exports:create', exportData),
  },
  files: {
    selectExcel: () => ipcRenderer.invoke('files:selectExcel'),
    readExcel: (filePath: string) => ipcRenderer.invoke('files:readExcel', filePath),
    selectFolder: () => ipcRenderer.invoke('files:selectFolder'),
    matchPhotos: (folderPath: string, students: any[], matchField: string) => 
      ipcRenderer.invoke('files:matchPhotos', folderPath, students, matchField),
    saveFile: (filename: string, content: string, encoding?: string, directory?: string) => 
      ipcRenderer.invoke('files:saveFile', filename, content, encoding, directory),
    exportZip: (outputPath: string, files: { name: string; buffer: ArrayBuffer }[]) =>
      ipcRenderer.invoke('files:exportZip', outputPath, files),
    exportPdf: (outputPath: string, options: any, cards: { front: string; back?: string; data: any }[]) =>
      ipcRenderer.invoke('files:exportPdf', outputPath, options, cards),
    openDirectory: (dirPath: string) => ipcRenderer.invoke('files:openDirectory', dirPath),
    readAsBase64: (filePath: string) => ipcRenderer.invoke('files:readAsBase64', filePath),
    getSystemFonts: () => ipcRenderer.invoke('files:getSystemFonts'),
  }
});
