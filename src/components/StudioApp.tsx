'use client';

import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { getPreflightReport, PreflightSeverity } from '../utils/preflight';
import Dashboard from './Dashboard';
import ExcelImport from './ExcelImport';
import PhotoImport from './PhotoImport';
import CanvasEditor from './CanvasEditor';
import PrintSheetBuilder from './PrintSheetBuilder';
import BatchPreview from './BatchPreview';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  CreditCard,
  FileSpreadsheet,
  Grid,
  Image as ImageIcon,
  LayoutGrid,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SidebarTab = 'excel' | 'photos' | 'canvas' | 'print' | 'preview';

const severityStyle: Record<PreflightSeverity, string> = {
  error: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
};

export default function StudioApp() {
  const { activeProject, activeTemplate, students, columns, mappedFields } = useStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>('excel');
  const [showPreflight, setShowPreflight] = useState(false);

  const report = useMemo(
    () => getPreflightReport(students, activeTemplate, columns, mappedFields),
    [students, activeTemplate, columns, mappedFields]
  );

  if (!activeProject) return <Dashboard />;

  const workflow = [
    { id: 'excel' as const, label: 'Import records', helper: 'Spreadsheet & fields', icon: FileSpreadsheet, complete: students.length > 0 },
    { id: 'photos' as const, label: 'Match photos', helper: `${report.matchedPhotos}/${report.totalRecords || 0} matched`, icon: ImageIcon, complete: students.length > 0 && report.matchedPhotos === students.length },
    { id: 'canvas' as const, label: 'Design card', helper: 'Template & layers', icon: LayoutGrid, complete: report.templateReady },
    { id: 'preview' as const, label: 'Validate & export', helper: 'Preview every record', icon: Play, complete: report.templateReady && students.length > 0 && report.issues.filter((issue) => issue.severity === 'error').length === 0 },
    { id: 'print' as const, label: 'Print layout', helper: 'Paper & imposition', icon: Grid, complete: false },
  ];
  const current = workflow.find((item) => item.id === activeTab)!;
  const blockingIssues = report.issues.filter((issue) => issue.severity === 'error');

  const navigate = (tab: SidebarTab) => {
    setActiveTab(tab);
    setShowPreflight(false);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b] text-foreground">
      <aside className="hidden w-[276px] shrink-0 flex-col border-r border-zinc-800/80 bg-[#111114] lg:flex">
        <div className="border-b border-zinc-800/80 px-5 pb-5 pt-5">
          <button
            onClick={() => useStore.setState({ activeProject: null, activeTemplate: null })}
            className="mb-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-zinc-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All projects
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-2.5">
              <CreditCard className="h-5 w-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-extrabold text-zinc-100" title={activeProject.name}>{activeProject.name}</h2>
              <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500">{activeTemplate?.name || 'Untitled template'}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-zinc-600">Production workflow</p>
          {workflow.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all ${isActive ? 'bg-sky-500 text-white shadow-lg shadow-sky-950/40' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100'}`}
              >
                <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white/15' : 'bg-zinc-800/70 text-zinc-400 group-hover:text-zinc-100'}`}>
                  <Icon className="h-4 w-4" />
                  {index < workflow.length - 1 && <span className="absolute left-1/2 top-9 h-3 w-px bg-zinc-800 group-last:hidden" />}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold">{item.label}</span>
                  <span className={`mt-0.5 block truncate text-[10px] font-medium ${isActive ? 'text-sky-100/80' : 'text-zinc-600'}`}>{item.helper}</span>
                </span>
                {item.complete ? <CheckCircle2 className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-emerald-400'}`} /> : <Circle className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white/80' : 'text-zinc-700'}`} />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800/80 p-4">
          <button onClick={() => setShowPreflight(true)} className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900">
            <div className={`rounded-xl p-2 ${blockingIssues.length ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
              {blockingIssues.length ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-zinc-200">Preflight check</span>
              <span className="mt-0.5 block text-[10px] text-zinc-500">{blockingIssues.length ? `${blockingIssues.length} item${blockingIssues.length === 1 ? '' : 's'} need attention` : 'Ready to export'}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-600" />
          </button>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[76px] shrink-0 items-center justify-between border-b border-zinc-800/70 bg-[#0d0d0f]/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-sky-500/10 p-2 text-sky-400 lg:hidden"><Sparkles className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-400">Step {workflow.findIndex((item) => item.id === activeTab) + 1} of {workflow.length}</p>
              <h1 className="truncate text-lg font-extrabold tracking-tight text-zinc-100">{current.label}</h1>
            </div>
          </div>
          <button onClick={() => setShowPreflight(true)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${blockingIssues.length ? 'border-rose-500/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15'}`}>
            {blockingIssues.length ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            <span className="hidden sm:inline">{blockingIssues.length ? `${blockingIssues.length} blockers` : 'Export ready'}</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }} className="min-h-full">
              {activeTab === 'excel' && <ExcelImport />}
              {activeTab === 'photos' && <PhotoImport />}
              {activeTab === 'canvas' && <CanvasEditor />}
              {activeTab === 'print' && <PrintSheetBuilder />}
              {activeTab === 'preview' && <BatchPreview />}
            </motion.div>
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {showPreflight && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex items-start justify-end bg-black/50 p-4 backdrop-blur-[2px] sm:p-6" onClick={() => setShowPreflight(false)}>
              <motion.section initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} onClick={(event) => event.stopPropagation()} className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-[#151518] shadow-2xl">
                <div className="flex items-start justify-between border-b border-zinc-800 p-5">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-400">Export safety</p>
                    <h2 className="mt-1 text-lg font-extrabold text-zinc-100">Preflight report</h2>
                    <p className="mt-1 text-xs text-zinc-500">Review the project before generating cards.</p>
                  </div>
                  <button onClick={() => setShowPreflight(false)} className="rounded-xl p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-3 gap-px border-b border-zinc-800 bg-zinc-800">
                  {[
                    ['Records', report.totalRecords],
                    ['Photos', `${report.matchedPhotos}/${report.totalRecords}`],
                    ['Ready', report.readyRecords],
                  ].map(([label, value]) => <div key={String(label)} className="bg-[#151518] px-3 py-4 text-center"><p className="text-lg font-extrabold text-zinc-100">{value}</p><p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">{label}</p></div>)}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                  {!report.issues.length && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-100"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Everything is ready</div><p className="mt-1 text-xs text-emerald-100/70">Your template and records are ready for export.</p></div>}
                  {report.issues.map((issue) => (
                    <button key={issue.id} onClick={() => navigate(issue.action)} className={`w-full rounded-2xl border p-4 text-left transition-colors hover:brightness-110 ${severityStyle[issue.severity]}`}>
                      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">{issue.title}</span><span className="mt-1 block text-[11px] leading-relaxed opacity-75">{issue.detail}</span></span><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" /></div>
                    </button>
                  ))}
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}