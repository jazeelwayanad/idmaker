'use client';

import React, { useState } from 'react';
import { useStore } from '../hooks/useStore';
import Dashboard from '../components/Dashboard';
import ExcelImport from '../components/ExcelImport';
import PhotoImport from '../components/PhotoImport';
import CanvasEditor from '../components/CanvasEditor';
import DataMapper from '../components/DataMapper';
import PrintSheetBuilder from '../components/PrintSheetBuilder';
import BatchPreview from '../components/BatchPreview';
import { 
  FileSpreadsheet, Image as ImageIcon, Settings, Grid, Play, LayoutGrid,
  ArrowLeft, CreditCard, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SidebarTab = 'excel' | 'photos' | 'canvas' | 'mapper' | 'print' | 'preview';

export default function Home() {
  const { activeProject, activeTemplate, openProject } = useStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>('excel');

  if (!activeProject) {
    return <Dashboard />;
  }

  const menuItems = [
    { id: 'excel', name: 'Import Excel', icon: FileSpreadsheet },
    { id: 'photos', name: 'Photo Matching', icon: ImageIcon },
    { id: 'canvas', name: 'Template Designer', icon: LayoutGrid },
    { id: 'preview', name: 'Preview & Export', icon: Play },
    { id: 'print', name: 'Print Layout', icon: Grid },
  ];

  return (
    <div className="flex h-screen bg-dark-900 text-foreground overflow-hidden">
      {/* Sidebar navigation */}
      <div className="w-64 glass-panel border-r border-zinc-800 flex flex-col justify-between shrink-0">
        <div className="flex-1 flex flex-col">
          {/* Back to Projects Header */}
          <div className="p-4 border-b border-zinc-800/80">
            <button
              onClick={() => useStore.setState({ activeProject: null, activeTemplate: null })}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-xs font-semibold uppercase tracking-wider mb-4 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-primary-500/10 p-2 rounded-xl border border-primary-500/20">
                <CreditCard className="w-5 h-5 text-primary-500" />
              </div>
              <div className="truncate">
                <h2 className="font-bold text-zinc-100 text-sm truncate" title={activeProject.name}>
                  {activeProject.name}
                </h2>
                <p className="text-[10px] text-zinc-500 font-medium truncate mt-0.5">
                  Template: {activeTemplate?.name || 'Loading...'}
                </p>
              </div>
            </div>
          </div>

          {/* Menu Options */}
          <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as SidebarTab)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all group ${
                    isActive 
                      ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/15' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    <span>{item.name}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-zinc-800/80 text-[10px] text-zinc-500 text-center font-semibold">
          Offline Mode • IDMaker v1.0.0
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-zinc-800/60 flex items-center justify-between px-8 bg-dark-900/65 backdrop-blur shrink-0">
          <h1 className="font-extrabold text-lg text-zinc-200 uppercase tracking-wider">
            {menuItems.find((m) => m.id === activeTab)?.name}
          </h1>
        </header>

        <main className="flex-1 p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {activeTab === 'excel' && <ExcelImport />}
              {activeTab === 'photos' && <PhotoImport />}
              {activeTab === 'canvas' && <CanvasEditor />}
              {activeTab === 'print' && <PrintSheetBuilder />}
              {activeTab === 'preview' && <BatchPreview />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
