import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { Folder, Image, Link2, AlertCircle, CheckCircle2, Search, SlidersHorizontal, Eye, EyeOff, ChevronDown, X } from 'lucide-react';

export default function PhotoImport() {
  const { students, columns, selectedPhotosFolder, selectPhotosFolder, setSelectedPhotosFolder, runPhotoMatching, cardFields } = useStore();
  const [matchField, setMatchField] = useState('registerNo');
  const [matching, setMatching] = useState(false);

  // Search/Filter state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Parse students local data
  const activeStudents = students.map(s => {
    try {
      const data = JSON.parse(s.data || '{}');
      return { ...s, parsedData: data };
    } catch {
      return { ...s, parsedData: {} };
    }
  });

  // Get active fields from excel excluding deselected fields
  const dataColumns = activeStudents.length > 0
    ? Object.keys(activeStudents[0].parsedData || {}).filter(k => {
        if (['errors', 'photoPath', 'registerNo', 'name'].includes(k)) return false;
        if (cardFields && cardFields.length > 0) {
          return cardFields.includes(k);
        }
        return true;
      })
    : [];

  // Column visibility state
  const allPhotoColumns = ['registerNo', 'name', ...dataColumns, 'matchedFile', 'status'];
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Sync / Initialize column visibility
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    allPhotoColumns.forEach(col => {
      initial[col] = visibleColumns[col] !== undefined ? visibleColumns[col] : true;
    });
    setVisibleColumns(initial);
  }, [dataColumns.join(','), students.length]);

  // Close column picker on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMatch = async () => {
    if (!selectedPhotosFolder) return;
    setMatching(true);
    try {
      await runPhotoMatching(matchField);
    } catch (err) {
      console.error(err);
      alert('Photo matching failed.');
    } finally {
      setMatching(false);
    }
  };

  const matchedCount = students.filter(s => s.photoPath).length;
  const missingCount = students.length - matchedCount;

  // Filter students based on search query
  const filteredStudents = activeStudents.filter(student => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchedFile = student.photoPath ? student.photoPath.split('\\').pop() || '' : 'none';
    const statusText = student.photoPath ? 'matched' : 'missing';
    
    if (student.registerNo?.toLowerCase().includes(q)) return true;
    if (student.name?.toLowerCase().includes(q)) return true;
    if (matchedFile.toLowerCase().includes(q)) return true;
    if (statusText.includes(q)) return true;

    for (const col of dataColumns) {
      if (String(student.parsedData?.[col] ?? '').toLowerCase().includes(q)) return true;
    }
    
    return false;
  });

  const toggleColumnVisibility = (col: string) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const visibleColCount = Object.values(visibleColumns).filter(Boolean).length;
  const totalColCount = allPhotoColumns.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <Image className="w-6 h-6 text-primary-500" />
          Photo Folder & Matching
        </h2>
        <p className="text-zinc-400 text-sm mt-1">
          Match physical photo files (e.g. 1001.jpg, ahmed.png) with records in SQLite database.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Step 1: Choose Folder */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-[240px]">
          <div>
            <span className="text-primary-500 font-bold text-xs uppercase">Step 1</span>
            <h3 className="font-semibold text-zinc-200 mt-1 mb-2">Select Photos Directory</h3>
            <p className="text-zinc-500 text-xs">
              Provide the directory containing all student portraits. We match filenames (case-insensitive).
            </p>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={selectedPhotosFolder}
              onChange={(e) => setSelectedPhotosFolder(e.target.value)}
              placeholder="Paste or type photo folder path here..."
              className="w-full bg-dark-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-primary-500 transition-colors"
              title={selectedPhotosFolder}
            />
            <button
              onClick={selectPhotosFolder}
              className="w-full bg-dark-800 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
            >
              <Folder className="w-4 h-4 text-zinc-400" />
              Choose Photo Folder
            </button>
          </div>
        </div>

        {/* Step 2: Choose Match Field */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-[240px]">
          <div>
            <span className="text-primary-500 font-bold text-xs uppercase">Step 2</span>
            <h3 className="font-semibold text-zinc-200 mt-1 mb-2">Select Matching Target</h3>
            <p className="text-zinc-500 text-xs">
              Choose the spreadsheet column that corresponds to the photo names.
            </p>
          </div>
          <div className="space-y-3">
            <select
              value={matchField}
              onChange={(e) => setMatchField(e.target.value)}
              className="w-full bg-dark-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 transition-colors"
            >
              <option value="registerNo">Register No (Default)</option>
              <option value="name">Name</option>
              {columns.map((col, idx) => (
                <option key={idx} value={col}>{col}</option>
              ))}
            </select>
            <button
              onClick={handleMatch}
              disabled={matching || !selectedPhotosFolder || students.length === 0}
              className="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
            >
              <Link2 className="w-4 h-4" />
              {matching ? 'Matching...' : 'Auto Match Images'}
            </button>
          </div>
        </div>

        {/* Step 3: Match Summary */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-[240px]">
          <div>
            <span className="text-primary-500 font-bold text-xs uppercase">Step 3</span>
            <h3 className="font-semibold text-zinc-200 mt-1 mb-2">Match Report</h3>
            <p className="text-zinc-500 text-xs">Real-time mapping statistics of images matched to students.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-dark-800 p-3 rounded-xl border border-zinc-800 flex flex-col">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase">Matched</span>
              <span className="text-xl font-bold text-green-400 mt-1">{matchedCount}</span>
            </div>
            <div className="bg-dark-800 p-3 rounded-xl border border-zinc-800 flex flex-col">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase">Missing</span>
              <span className="text-xl font-bold text-red-400 mt-1">{missingCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Directory Match Previews */}
      {students.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-zinc-200">Image Mapping Log</span>
          </div>

          {/* Search & Column Visibility Toolbar */}
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search matching log..."
                className="w-full bg-dark-800 border border-zinc-700/60 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/60 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Column Visibility Dropdown */}
            <div className="relative" ref={columnPickerRef}>
              <button
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                  showColumnPicker
                    ? 'bg-primary-500/10 border-primary-500/40 text-primary-400'
                    : 'bg-dark-800 border-zinc-700/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Columns
                <span className="text-[10px] opacity-70">{visibleColCount}/{totalColCount}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showColumnPicker ? 'rotate-180' : ''}`} />
              </button>

              {showColumnPicker && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-dark-800 border border-zinc-700/60 rounded-xl shadow-2xl shadow-black/40 z-50 p-2 space-y-0.5 max-h-64 overflow-y-auto">
                  <div className="px-2 py-1.5 text-[10px] text-zinc-500 font-bold uppercase border-b border-zinc-800 mb-1">Toggle Columns</div>
                  {allPhotoColumns.map((col) => {
                    const label = col === 'registerNo' ? 'Register No' : col === 'name' ? 'Name' : col === 'matchedFile' ? 'Matched File Name' : col === 'status' ? 'Status' : col;
                    const isVisible = visibleColumns[col] !== false;
                    return (
                      <button
                        key={col}
                        onClick={() => toggleColumnVisibility(col)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isVisible
                            ? 'text-zinc-200 hover:bg-zinc-700/40'
                            : 'text-zinc-500 hover:bg-zinc-800/60'
                        }`}
                      >
                        {isVisible ? (
                          <Eye className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        )}
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Results count */}
            {searchQuery && (
              <span className="text-[10px] text-zinc-500 font-semibold">
                {filteredStudents.length} of {students.length} rows
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-dark-800 border-b border-zinc-800 text-zinc-400">
                  {visibleColumns['status'] !== false && <th className="p-3 font-semibold uppercase">Status</th>}
                  {visibleColumns['registerNo'] !== false && <th className="p-3 font-semibold uppercase">Register No</th>}
                  {visibleColumns['name'] !== false && <th className="p-3 font-semibold uppercase">Name</th>}
                  {dataColumns.filter(col => visibleColumns[col] !== false).map((col, idx) => (
                    <th key={idx} className="p-3 font-semibold uppercase">{col}</th>
                  ))}
                  {visibleColumns['matchedFile'] !== false && <th className="p-3 font-semibold uppercase">Matched File Name</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {filteredStudents.slice(0, 50).map((student) => (
                  <tr key={student.id} className="hover:bg-zinc-800/10 transition-colors">
                    {visibleColumns['status'] !== false && (
                      <td className="p-3">
                        {student.photoPath ? (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/10 text-green-400 font-semibold px-2.5 py-0.5 rounded">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Matched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 font-semibold px-2.5 py-0.5 rounded">
                            <AlertCircle className="w-3.5 h-3.5" /> Missing
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns['registerNo'] !== false && <td className="p-3 font-semibold text-zinc-400">{student.registerNo}</td>}
                    {visibleColumns['name'] !== false && <td className="p-3 font-medium text-zinc-200">{student.name}</td>}
                    {dataColumns.filter(col => visibleColumns[col] !== false).map((col) => (
                      <td key={col} className="p-3 text-zinc-300 truncate max-w-[120px]">
                        {String(student.parsedData?.[col] ?? '') || '—'}
                      </td>
                    ))}
                    {visibleColumns['matchedFile'] !== false && (
                      <td className="p-3 font-mono text-zinc-500 truncate max-w-[200px]">
                        {student.photoPath ? student.photoPath.split('\\').pop() : 'None'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredStudents.length > 50 && (
            <p className="text-zinc-500 text-center text-xs pt-2">And {filteredStudents.length - 50} more rows... Use search to narrow results.</p>
          )}
        </div>
      )}
    </div>
  );
}

