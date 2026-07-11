import React, { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { Plus, CreditCard, FolderOpen, Calendar, Trash2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const { projects, fetchProjects, createProject, openProject, deleteProject } = useStore();
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setLoading(true);
    try {
      await createProject(newProjectName.trim());
      setNewProjectName('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 text-foreground p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-3 bg-gradient-to-r from-primary-500 to-sky-600 text-transparent bg-clip-text font-extrabold text-5xl mb-4">
              <CreditCard className="w-12 h-12 text-primary-500 stroke-[2.5]" />
              IDMaker Pro
            </div>
            <p className="text-zinc-400 text-lg max-w-xl mx-auto">
              Professional Bulk ID Card Production System. Create, design, map, and export ready-to-print batch templates offline.
            </p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Create New Project */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel p-6 rounded-2xl flex flex-col justify-between"
          >
            <div>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary-500" />
                New Project
              </h2>
              <p className="text-sm text-zinc-400 mb-6">
                Initialize a workspace to design template back/front and batch import.
              </p>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. College ID 2026"
                className="w-full bg-dark-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-500 transition-colors"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary-500/20"
              >
                {loading ? 'Creating...' : 'Create Project'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </motion.div>

          {/* Recent Projects List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="md:col-span-2 glass-panel p-6 rounded-2xl flex flex-col"
          >
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary-500" />
              Recent Projects
            </h2>
            
            {projects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 py-12">
                <CreditCard className="w-12 h-12 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-sm">No projects created yet. Let's start by creating one!</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[320px] space-y-3 pr-2">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="flex items-center justify-between p-4 bg-dark-800 border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all group"
                  >
                    <div 
                      onClick={() => openProject(proj)}
                      className="flex-1 cursor-pointer"
                    >
                      <h3 className="font-semibold text-zinc-100 group-hover:text-primary-500 transition-colors">
                        {proj.name}
                      </h3>
                      <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Updated: {new Date(proj.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteProject(proj.id)}
                      className="text-zinc-500 hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
