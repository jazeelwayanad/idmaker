import { create } from 'zustand';

// Types matching Electron Database schema
export interface Project {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: string; // JSON string
}

export interface Template {
  id: number;
  projectId: number;
  name: string;
  width: number;
  height: number;
  unit: string;
  frontDesign: string; // JSON string representing Fabric.js design
  backDesign: string; // JSON string representing Fabric.js design
  fieldMapping: string; // JSON mapping: { placeholderName: spreadsheetColumnName }
  conditionalRules: string; // JSON list of rules
  paperSize: string;
  layout: string; // JSON for margins, grid columns, rows, etc.
}

export interface Student {
  id: number;
  projectId: number;
  registerNo: string;
  name: string;
  photoPath: string;
  data: string; // JSON string of all student fields
  errors: string; // JSON string of warnings
}

export interface Export {
  id: number;
  projectId: number;
  filename: string;
  filePath: string;
  type: string;
  createdAt: string;
  count: number;
}

interface AppState {
  projects: Project[];
  activeProject: Project | null;
  activeTemplate: Template | null;
  students: Student[];
  columns: string[];
  selectedPhotosFolder: string;
  mappedFields: Record<string, string>; // { '{Name}': 'Student Name', ... }
  conditionalRules: any[];
  activeStudentIndex: number;
  cardFields: string[]; // columns selected for ID card placeholders (e.g. ['Name', 'RegNo', '{Photo}'])
  exports: Export[];
  isGenerating: boolean;
  generationProgress: number;

  // Actions
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<any>;
  deleteProject: (id: number) => Promise<void>;
  openProject: (project: Project) => Promise<void>;
  saveTemplate: (templateData: Partial<Template>) => Promise<void>;
  importExcelData: (studentList: any[], headers: string[], excelPath?: string) => Promise<void>;
  selectPhotosFolder: () => Promise<void>;
  setSelectedPhotosFolder: (folder: string) => void;
  runPhotoMatching: (matchField: string) => Promise<void>;
  updateMappedFields: (mapping: Record<string, string>) => Promise<void>;
  updateConditionalRules: (rules: any[]) => Promise<void>;
  setStudentIndex: (idx: number) => void;
  nextStudent: () => void;
  prevStudent: () => void;
  clearProjectData: () => Promise<void>;
  fetchExports: () => Promise<void>;
  setCardFields: (fields: string[]) => Promise<void>;
}

// Global declaration for Window api (Electron preload bridge)
declare global {
  interface Window {
    api: {
      projects: {
        list: () => Promise<Project[]>;
        create: (name: string, settings: any) => Promise<{ id: number }>;
        update: (id: number, name: string, settings: any) => Promise<any>;
        delete: (id: number) => Promise<any>;
        get: (id: number) => Promise<Project>;
      };
      templates: {
        get: (projectId: number) => Promise<Template>;
        save: (template: any) => Promise<any>;
      };
      students: {
        list: (projectId: number) => Promise<Student[]>;
        import: (projectId: number, students: any[]) => Promise<any>;
        updatePhoto: (id: number, photoPath: string) => Promise<any>;
        clear: (projectId: number) => Promise<any>;
      };
      exports: {
        list: (projectId: number) => Promise<Export[]>;
        create: (exportData: any) => Promise<any>;
      };
      files: {
        selectExcel: () => Promise<string | null>;
        readExcel: (filePath: string) => Promise<{ data: any[]; headers: string[] }>;
        selectFolder: () => Promise<string | null>;
        matchPhotos: (folderPath: string, students: any[], matchField: string) => Promise<any[]>;
        saveFile: (filename: string, content: string, encoding?: string, directory?: string) => Promise<string | null>;
        exportZip: (outputPath: string, files: { name: string; buffer: ArrayBuffer }[]) => Promise<string>;
        exportPdf: (outputPath: string, options: any, cards: { front: string; back?: string; data: any }[]) => Promise<string>;
        openDirectory: (dirPath: string) => Promise<boolean>;
        readAsBase64: (filePath: string) => Promise<string | null>;
      };
    };
  }
}

export const useStore = create<AppState>((set, get) => ({
  projects: [],
  activeProject: null,
  activeTemplate: null,
  students: [],
  columns: [],
  selectedPhotosFolder: '',
  mappedFields: {},
  conditionalRules: [],
  activeStudentIndex: 0,
  cardFields: [],
  exports: [],
  isGenerating: false,
  generationProgress: 0,

  fetchProjects: async () => {
    if (typeof window === 'undefined' || !window.api) return;
    const list = await window.api.projects.list();
    set({ projects: list });
  },

  createProject: async (name: string) => {
    if (typeof window === 'undefined' || !window.api) return;
    const settings = { defaultFolder: '' };
    const res = await window.api.projects.create(name, settings);
    await get().fetchProjects();
    return res;
  },

  deleteProject: async (id: number) => {
    if (typeof window === 'undefined' || !window.api) return;
    await window.api.projects.delete(id);
    if (get().activeProject?.id === id) {
      set({ activeProject: null, activeTemplate: null, students: [], columns: [], exports: [] });
    }
    await get().fetchProjects();
  },

  openProject: async (project: Project) => {
    if (typeof window === 'undefined' || !window.api) return;
    
    // Load project templates
    const template = await window.api.templates.get(project.id);
    
    // Load project students
    const studentList = await window.api.students.list(project.id);

    // Extract headers/columns if students exist
    let cols: string[] = [];
    if (studentList.length > 0) {
      try {
        const firstData = JSON.parse(studentList[0].data || '{}');
        cols = Object.keys(firstData).filter(k => k !== 'errors' && k !== 'photoPath');
      } catch (e) {
        console.error(e);
      }
    }

    // Parse fieldMapping and rules
    let mapping: Record<string, string> = {};
    let rules: any[] = [];
    let cardFields: string[] = [];
    if (template) {
      try {
        mapping = template.fieldMapping ? JSON.parse(template.fieldMapping) : {};
        rules = template.conditionalRules ? JSON.parse(template.conditionalRules) : [];
      } catch (e) {
        console.error(e);
      }
    }
    // Load cardFields from project settings
    try {
      const settings = JSON.parse(project.settings || '{}');
      cardFields = settings.cardFields || [];
    } catch (e) {}

    set({
      activeProject: project,
      activeTemplate: template || null,
      students: studentList,
      columns: cols,
      mappedFields: mapping,
      conditionalRules: rules,
      activeStudentIndex: 0,
      cardFields,
    });

    await get().fetchExports();
  },

  saveTemplate: async (templateData: Partial<Template>) => {
    const { activeTemplate, activeProject } = get();
    if (typeof window === 'undefined' || !window.api || !activeProject) return;

    const mergedTemplate = {
      ...(activeTemplate || {}),
      ...templateData,
      projectId: activeProject.id,
    };

    await window.api.templates.save(mergedTemplate);
    const updatedTemplate = await window.api.templates.get(activeProject.id);
    
    // Refresh the mappings and rules in store
    let mapping = get().mappedFields;
    let rules = get().conditionalRules;
    if (updatedTemplate) {
      try {
        mapping = updatedTemplate.fieldMapping ? JSON.parse(updatedTemplate.fieldMapping) : {};
        rules = updatedTemplate.conditionalRules ? JSON.parse(updatedTemplate.conditionalRules) : [];
      } catch (e) {
        console.error(e);
      }
    }

    set({ 
      activeTemplate: updatedTemplate,
      mappedFields: mapping,
      conditionalRules: rules
    });
  },

  importExcelData: async (studentList: any[], headers: string[], excelPath?: string) => {
    const { activeProject } = get();
    if (typeof window === 'undefined' || !window.api || !activeProject) return;

    if (excelPath) {
      let settings: any = {};
      try { settings = JSON.parse(activeProject.settings || '{}'); } catch {}
      
      // Extract base name without extension
      let baseName = excelPath.split(/[/\\]/).pop() || '';
      const lastDot = baseName.lastIndexOf('.');
      if (lastDot !== -1) {
        baseName = baseName.substring(0, lastDot);
      }
      
      settings.excelName = baseName;
      
      await window.api.projects.update(activeProject.id, activeProject.name, settings);
      set({
        activeProject: { ...activeProject, settings: JSON.stringify(settings) }
      });
    }

    // Standardize students schema
    const formatted = studentList.map((s, index) => {
      const keys = Object.keys(s);
      
      // Find possible Register No columns, default to first column
      const regNoKey = keys.find(k => 
        ['regno', 'register', 'roll', 'admission', 'id', 'reg no', 'roll no', 'register no', 'register_no', 'reg. no', 'reg.no'].includes(k.toLowerCase().trim())
      ) || keys[0];
      
      const regVal = regNoKey ? String(s[regNoKey]) : `REC_${index + 1}`;
      
      // Find possible Name columns, default to second column (or first)
      const nameKey = keys.find(k => 
        ['name', 'student name', 'full name'].includes(k.toLowerCase().trim())
      ) || keys[1] || keys[0];
      
      const nameVal = nameKey ? String(s[nameKey]) : `Record ${index + 1}`;

      return {
        registerNo: regVal,
        name: nameVal,
        photoPath: '',
        errors: [],
        ...s // preserve all original keys
      };
    });

    await window.api.students.import(activeProject.id, formatted);
    
    // Reload students list
    const updatedList = await window.api.students.list(activeProject.id);
    set({
      students: updatedList,
      columns: headers,
      activeStudentIndex: 0
    });
  },

  selectPhotosFolder: async () => {
    if (typeof window === 'undefined' || !window.api) return;
    const folder = await window.api.files.selectFolder();
    if (folder) {
      set({ selectedPhotosFolder: folder });
    }
  },

  setSelectedPhotosFolder: (folder: string) => {
    set({ selectedPhotosFolder: folder });
  },

  runPhotoMatching: async (matchField: string) => {
    const { selectedPhotosFolder, students, activeProject } = get();
    if (typeof window === 'undefined' || !window.api || !activeProject || !selectedPhotosFolder) return;

    // Convert students database objects into list of raw objects
    const rawStudents = students.map(s => {
      const parsedData = JSON.parse(s.data || '{}');
      return {
        ...parsedData,
        id: s.id,
        photoPath: s.photoPath,
        errors: JSON.parse(s.errors || '[]')
      };
    });

    const matched = await window.api.files.matchPhotos(selectedPhotosFolder, rawStudents, matchField);
    
    // Save photo mappings back to SQLite database in a single import call
    await window.api.students.import(activeProject.id, matched);

    const updatedList = await window.api.students.list(activeProject.id);
    set({ students: updatedList });
  },

  updateMappedFields: async (mapping: Record<string, string>) => {
    const { activeTemplate } = get();
    if (!activeTemplate) return;
    await get().saveTemplate({ fieldMapping: JSON.stringify(mapping) });
  },

  updateConditionalRules: async (rules: any[]) => {
    const { activeTemplate } = get();
    if (!activeTemplate) return;
    await get().saveTemplate({ conditionalRules: JSON.stringify(rules) });
  },

  setStudentIndex: (idx: number) => {
    const { students } = get();
    if (idx >= 0 && idx < students.length) {
      set({ activeStudentIndex: idx });
    }
  },

  nextStudent: () => {
    const { activeStudentIndex, students } = get();
    if (activeStudentIndex < students.length - 1) {
      set({ activeStudentIndex: activeStudentIndex + 1 });
    }
  },

  prevStudent: () => {
    const { activeStudentIndex } = get();
    if (activeStudentIndex > 0) {
      set({ activeStudentIndex: activeStudentIndex - 1 });
    }
  },

  clearProjectData: async () => {
    const { activeProject } = get();
    if (typeof window === 'undefined' || !window.api || !activeProject) return;
    await window.api.students.clear(activeProject.id);
    set({ students: [], columns: [], selectedPhotosFolder: '', activeStudentIndex: 0 });
  },

  fetchExports: async () => {
    const { activeProject } = get();
    if (typeof window === 'undefined' || !window.api || !activeProject) return;
    const list = await window.api.exports.list(activeProject.id);
    set({ exports: list });
  },

  setCardFields: async (fields: string[]) => {
    const { activeProject } = get();
    if (typeof window === 'undefined' || !window.api || !activeProject) return;
    // Persist into project settings JSON
    let settings: any = {};
    try { settings = JSON.parse(activeProject.settings || '{}'); } catch {}
    settings.cardFields = fields;
    await window.api.projects.update(activeProject.id, activeProject.name, settings);
    set({
      cardFields: fields,
      activeProject: { ...activeProject, settings: JSON.stringify(settings) }
    });
  }
}));
