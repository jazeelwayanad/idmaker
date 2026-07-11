import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle, Trash2, Save, Pencil, X, Search, SlidersHorizontal, Eye, EyeOff, ChevronDown, CreditCard, ImageIcon } from 'lucide-react';

export default function ExcelImport() {
  const { students, columns, importExcelData, clearProjectData, activeProject, cardFields, setCardFields } = useStore();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Column selection step
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [includePhoto, setIncludePhoto] = useState(true);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ studentId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editableStudents, setEditableStudents] = useState<any[]>([]);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  // Filter & Column visibility state
  const [searchQuery, setSearchQuery] = useState('');
  const [previewSearchQuery, setPreviewSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [previewVisibleColumns, setPreviewVisibleColumns] = useState<Record<string, boolean>>({});
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showPreviewColumnPicker, setShowPreviewColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const previewColumnPickerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
      if (previewColumnPickerRef.current && !previewColumnPickerRef.current.contains(e.target as Node)) {
        setShowPreviewColumnPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync students from store into local editable list
  useEffect(() => {
    if (students.length > 0 && !hasLocalEdits) {
      setEditableStudents(students.map(s => {
        try {
          const data = JSON.parse(s.data || '{}');
          return { ...s, parsedData: data };
        } catch {
          return { ...s, parsedData: {} };
        }
      }));
    }
  }, [students, hasLocalEdits]);

  const handleSelectFile = async () => {
    if (typeof window === 'undefined' || !window.api) return;
    try {
      const selectedPath = await window.api.files.selectExcel();
      if (!selectedPath) return;
      setIsProcessing(true);
      setFilePath(selectedPath);
      const parsed = await window.api.files.readExcel(selectedPath);
      setPreviewData(parsed.data);
      setPreviewHeaders(parsed.headers);
      // Auto-open field picker with all fields pre-selected
      setSelectedFields([...parsed.headers]);
      setShowFieldPicker(true);
    } catch (err) {
      console.error(err);
      alert('Failed to parse spreadsheet file. Ensure it is valid .xlsx or .csv');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const handleConfirmFieldsAndImport = async () => {
    if (previewData.length === 0) return;
    setIsProcessing(true);
    try {
      // Build final card fields: selected data columns + special placeholders
      const finalFields: string[] = [...selectedFields];
      if (includePhoto) finalFields.push('{Photo}');

      // Save card fields selection to store
      await setCardFields(finalFields);

      // Import data
      await importExcelData(previewData, previewHeaders, filePath || undefined);
      setPreviewData([]);
      setPreviewHeaders([]);
      setFilePath(null);
      setShowFieldPicker(false);
      setHasLocalEdits(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save imported records.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ━━━ Inline Editing ━━━
  const startEdit = (studentId: number, field: string, currentValue: string) => {
    setEditingCell({ studentId, field });
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const applyEdit = () => {
    if (!editingCell) return;
    setEditableStudents(prev => prev.map(s => {
      if (s.id !== editingCell.studentId) return s;
      const updated = { ...s };
      if (editingCell.field === 'registerNo') {
        updated.registerNo = editValue;
      } else if (editingCell.field === 'name') {
        updated.name = editValue;
      } else {
        updated.parsedData = { ...updated.parsedData, [editingCell.field]: editValue };
      }
      updated.data = JSON.stringify(updated.parsedData);
      return updated;
    }));
    setHasLocalEdits(true);
    setEditingCell(null);
    setEditValue('');
  };

  const handleSaveEdits = async () => {
    if (typeof window === 'undefined' || !window.api || !activeProject) return;
    setIsProcessing(true);
    try {
      const formatted = editableStudents.map(s => ({
        ...s.parsedData,
        registerNo: s.registerNo,
        name: s.name,
        photoPath: s.photoPath,
      }));
      await window.api.students.import(activeProject.id, formatted);
      const updatedList = await window.api.students.list(activeProject.id);
      useStore.setState({ students: updatedList });
      setHasLocalEdits(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save edits.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') applyEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  // ━━━ Stats ━━━
  const activeStudents = editableStudents.length > 0 ? editableStudents : students.map(s => ({ ...s, parsedData: {} }));
  const missingRegCount = students.filter(s => {
    try { return JSON.parse(s.errors || '[]').includes('Missing Reg No'); } catch { return false; }
  }).length;
  const missingNameCount = students.filter(s => {
    try { return JSON.parse(s.errors || '[]').includes('Missing Name'); } catch { return false; }
  }).length;

  const dataColumns = activeStudents.length > 0
    ? Object.keys(activeStudents[0].parsedData || {}).filter(k => !['errors', 'photoPath', 'registerNo', 'name'].includes(k))
    : [];

  // Initialize visible columns when dataColumns change
  const allDirectoryColumns = ['registerNo', 'name', ...dataColumns, 'photo', 'status'];
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    allDirectoryColumns.forEach(col => {
      initial[col] = visibleColumns[col] !== undefined ? visibleColumns[col] : true;
    });
    setVisibleColumns(initial);
  }, [dataColumns.join(','), students.length]);

  // Filter active students by search query
  const filteredStudents = activeStudents.filter(student => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (student.registerNo?.toLowerCase().includes(q)) return true;
    if (student.name?.toLowerCase().includes(q)) return true;
    for (const col of dataColumns) {
      if (String(student.parsedData?.[col] ?? '').toLowerCase().includes(q)) return true;
    }
    if (student.photoPath && student.photoPath.toLowerCase().includes(q)) return true;
    return false;
  });

  const toggleColumnVisibility = (col: string) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const visibleColCount = Object.values(visibleColumns).filter(Boolean).length;
  const totalColCount = allDirectoryColumns.length;

  const totalStudentsCount = students.length;

  // Track empty/missing counts for every column dynamically
  const emptyFieldCounts: Record<string, number> = {};
  let invalidStudentsCount = 0;

  students.forEach(s => {
    try {
      const data = JSON.parse(s.data || '{}');
      let hasIssue = false;

      if (!s.registerNo?.trim()) {
        emptyFieldCounts['Register No'] = (emptyFieldCounts['Register No'] || 0) + 1;
        hasIssue = true;
      }
      if (!s.name?.trim()) {
        emptyFieldCounts['Name'] = (emptyFieldCounts['Name'] || 0) + 1;
        hasIssue = true;
      }

      dataColumns.forEach(col => {
        const val = data[col];
        if (val === undefined || val === null || String(val).trim() === '') {
          emptyFieldCounts[col] = (emptyFieldCounts[col] || 0) + 1;
          hasIssue = true;
        }
      });

      if (hasIssue) {
        invalidStudentsCount++;
      }
    } catch {
      invalidStudentsCount++;
    }
  });

  const validStudentsCount = totalStudentsCount - invalidStudentsCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-primary-500" />
            Excel Data Import
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Load students, employees, or visitor records from spreadsheets (.xlsx, .xls, .csv).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasLocalEdits && (
            <button
              onClick={handleSaveEdits}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold transition-all shadow-md shadow-primary-500/10"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          )}
          {students.length > 0 && (
            <button
              onClick={() => { clearProjectData(); setHasLocalEdits(false); setEditableStudents([]); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Clear Data
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Block */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-[240px]">
          <div>
            <h3 className="font-semibold text-zinc-200 mb-2">Select Spreadsheet</h3>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Upload spreadsheets mapping student or employee details. File name doesn't matter, headers will be parsed.
            </p>
          </div>
          <div className="space-y-3">
            {filePath && !showFieldPicker && (
              <div className="bg-dark-800 p-3 rounded-lg border border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
                <span className="truncate max-w-[200px]">{filePath.split('\\').pop()}</span>
                <span className="text-primary-500 font-semibold">{previewData.length} records</span>
              </div>
            )}
            <button
              onClick={handleSelectFile}
              disabled={isProcessing}
              className="w-full bg-dark-800 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <Upload className="w-4 h-4 text-zinc-400" />
              Choose Excel File
            </button>
          </div>
        </div>

        {/* Status Blocks */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-[240px]">
          <div>
            <h3 className="font-semibold text-zinc-200 mb-2">Project Stats</h3>
            <p className="text-zinc-500 text-xs">Overview of student directory records loaded into SQLite database.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-dark-800 p-4 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 text-xs uppercase font-medium">Total Rows</span>
              <p className="text-2xl font-bold text-zinc-200 mt-1">{students.length}</p>
            </div>
            <div className="bg-dark-800 p-4 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 text-xs uppercase font-medium">Columns</span>
              <p className="text-2xl font-bold text-zinc-200 mt-1">{columns.length}</p>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-[240px]">
          <div>
            <h3 className="font-semibold text-zinc-200 mb-2">Data Quality</h3>
            <p className="text-zinc-500 text-xs">
              {totalStudentsCount === 0 
                ? 'No data imported yet.' 
                : invalidStudentsCount > 0 
                ? 'Action required: some records contain errors.' 
                : 'All imported records are valid.'}
            </p>
          </div>
          <div className="space-y-2">
            {totalStudentsCount === 0 ? (
              <div className="text-zinc-500 text-xs italic py-2 text-center bg-dark-800 border border-zinc-800 rounded-lg">
                Waiting for spreadsheet...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-2.5 bg-dark-800 border border-zinc-800 rounded-lg text-xs">
                  <span className="text-zinc-400">Healthy Records</span>
                  <span className="px-2 py-0.5 rounded font-semibold bg-green-500/10 text-green-400">
                    {validStudentsCount} / {totalStudentsCount}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-dark-800 border border-zinc-800 rounded-lg text-xs">
                  <span className="text-zinc-400">Records with Empty Fields</span>
                  <span className={`px-2 py-0.5 rounded font-semibold ${invalidStudentsCount > 0 ? 'bg-red-500/10 text-red-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {invalidStudentsCount}
                  </span>
                </div>
                {invalidStudentsCount > 0 && (
                  <div className="text-[9px] text-zinc-500 flex flex-col gap-0.5 px-1 max-h-[60px] overflow-y-auto">
                    {Object.entries(emptyFieldCounts).map(([field, count]) => (
                      <div key={field} className="flex justify-between">
                        <span>Missing {field}:</span>
                        <span>{count} rows</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ Field Picker Step ━━━ */}
      {showFieldPicker && previewData.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <h3 className="font-bold text-zinc-100 text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary-500" />
                Select Fields for ID Card
              </h3>
              <p className="text-zinc-400 text-xs mt-1">
                Choose which data columns should appear as placeholders on your ID card design. Deselect columns you don't need.
              </p>
            </div>
            <span className="text-primary-500 text-xs font-semibold bg-primary-500/10 border border-primary-500/20 px-3 py-1 rounded-lg">
              {selectedFields.length} selected
            </span>
          </div>

          {/* Column Chips */}
          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-2">Data Columns</label>
            <div className="flex flex-wrap gap-2">
              {previewHeaders.map((hdr) => {
                const isSelected = selectedFields.includes(hdr);
                return (
                  <button
                    key={hdr}
                    onClick={() => toggleField(hdr)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-primary-500/15 border-primary-500/40 text-primary-400 shadow-sm shadow-primary-500/10'
                        : 'bg-dark-800 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
                    }`}
                  >
                    {isSelected && <span className="mr-1">✓</span>}
                    {hdr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Special Placeholders */}
          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-2">Special Placeholders</label>
            <div className="flex gap-3">
              <button
                onClick={() => setIncludePhoto(!includePhoto)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  includePhoto
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-dark-800 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                }`}
              >
                {includePhoto && <span>✓</span>}
                📷 Photo Placeholder
              </button>
            </div>
          </div>

          {/* Preview Table (mini) */}
          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-2">Preview (first 3 rows)</label>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-dark-800 border-b border-zinc-800 text-zinc-400">
                    {previewHeaders.map((hdr, idx) => {
                      const isSelected = selectedFields.includes(hdr);
                      return (
                        <th key={idx} className={`p-3 font-semibold uppercase transition-colors ${isSelected ? 'text-primary-400' : 'text-zinc-600 line-through'}`}>{hdr}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                  {previewData.slice(0, 3).map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-zinc-800/10 transition-colors">
                      {previewHeaders.map((hdr, colIdx) => {
                        const isSelected = selectedFields.includes(hdr);
                        return (
                          <td key={colIdx} className={`p-3 truncate max-w-[150px] ${isSelected ? '' : 'text-zinc-600 opacity-40'}`}>{String(row[hdr] || '')}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => setShowFieldPicker(false)}
              className="text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmFieldsAndImport}
              disabled={isProcessing || selectedFields.length === 0}
              className="bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 text-white font-bold py-2.5 px-8 rounded-xl transition-all shadow-lg shadow-primary-500/20 text-sm"
            >
              {isProcessing ? 'Importing...' : `Import & Create ${selectedFields.length + (includePhoto ? 1 : 0)} Placeholders`}
            </button>
          </div>
        </div>
      )}

      {/* Active Database Table - Editable */}
      {students.length > 0 && !showFieldPicker && (
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-zinc-200">Student Directory</span>
            <div className="flex items-center gap-3">
              {cardFields.length > 0 && (
                <span className="text-[10px] text-primary-400 bg-primary-500/10 border border-primary-500/20 px-2 py-0.5 rounded font-semibold">
                  {cardFields.filter(f => f && typeof f === 'string' && !f.startsWith('{')).length} fields on card
                </span>
              )}
              <span className="text-zinc-500 text-[10px] uppercase font-semibold flex items-center gap-1">
                <Pencil className="w-3 h-3" /> Click any cell to edit
              </span>
            </div>
          </div>

          {/* ── Search & Column Visibility Toolbar ── */}
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search records..."
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
                  {allDirectoryColumns.map((col) => {
                    const label = col === 'registerNo' ? 'Register No' : col === 'photo' ? 'Photo' : col === 'status' ? 'Status' : col === 'name' ? 'Name' : col;
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
                  <div className="border-t border-zinc-800 pt-1 mt-1 flex gap-1">
                    <button
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        allDirectoryColumns.forEach(c => all[c] = true);
                        setVisibleColumns(all);
                      }}
                      className="flex-1 text-[10px] text-primary-400 hover:bg-primary-500/10 rounded-md py-1 font-semibold transition-colors"
                    >Show All</button>
                    <button
                      onClick={() => {
                        const none: Record<string, boolean> = {};
                        allDirectoryColumns.forEach(c => none[c] = false);
                        // Keep at least registerNo and name visible
                        none['registerNo'] = true;
                        none['name'] = true;
                        setVisibleColumns(none);
                      }}
                      className="flex-1 text-[10px] text-zinc-500 hover:bg-zinc-700/30 rounded-md py-1 font-semibold transition-colors"
                    >Minimal</button>
                  </div>
                </div>
              )}
            </div>

            {/* Result count */}
            {searchQuery && (
              <span className="text-[10px] text-zinc-500 font-semibold">
                {filteredStudents.length} of {activeStudents.length} rows
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
                  {visibleColumns['photo'] !== false && <th className="p-3 font-semibold uppercase">Photo</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {filteredStudents.slice(0, 50).map((student) => {
                  const rowErrors: string[] = [];
                  if (cardFields.includes('{Photo}') && !student.photoPath) {
                    rowErrors.push('Missing Photo');
                  }

                  const isEditingReg = editingCell?.studentId === student.id && editingCell?.field === 'registerNo';
                  const isEditingName = editingCell?.studentId === student.id && editingCell?.field === 'name';

                  return (
                    <tr key={student.id} className="hover:bg-zinc-800/10 transition-colors">
                      {visibleColumns['status'] !== false && (
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {rowErrors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/10 text-green-400 font-semibold px-2 py-0.5 rounded"><CheckCircle className="w-3 h-3" /> Valid</span>
                          ) : (
                            rowErrors.map((err: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 font-semibold px-2 py-0.5 rounded"><AlertCircle className="w-3 h-3" /> {err}</span>
                            ))
                          )}
                        </div>
                      </td>
                      )}
                      {visibleColumns['registerNo'] !== false && (
                      <td className="p-1">
                        {isEditingReg ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} className="bg-dark-900 border border-primary-500 rounded px-2 py-1 text-xs w-full focus:outline-none" />
                            <button onClick={applyEdit} className="text-green-400 hover:text-green-300"><CheckCircle className="w-3.5 h-3.5" /></button>
                            <button onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <span onClick={() => startEdit(student.id, 'registerNo', student.registerNo)} className="block px-2 py-1.5 cursor-pointer hover:bg-zinc-800/50 rounded font-semibold text-zinc-400 transition-colors">{student.registerNo || '—'}</span>
                        )}
                      </td>
                      )}
                      {visibleColumns['name'] !== false && (
                      <td className="p-1">
                        {isEditingName ? (
                          <div className="flex items-center gap-1">
                            <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} className="bg-dark-900 border border-primary-500 rounded px-2 py-1 text-xs w-full focus:outline-none" />
                            <button onClick={applyEdit} className="text-green-400 hover:text-green-300"><CheckCircle className="w-3.5 h-3.5" /></button>
                            <button onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <span onClick={() => startEdit(student.id, 'name', student.name)} className="block px-2 py-1.5 cursor-pointer hover:bg-zinc-800/50 rounded font-medium text-zinc-200 transition-colors">{student.name || '—'}</span>
                        )}
                      </td>
                      )}
                      {dataColumns.filter(col => visibleColumns[col] !== false).map((col) => {
                        const isEditingThis = editingCell?.studentId === student.id && editingCell?.field === col;
                        const cellVal = String(student.parsedData?.[col] ?? '');
                        return (
                          <td key={col} className="p-1">
                            {isEditingThis ? (
                              <div className="flex items-center gap-1">
                                <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown} className="bg-dark-900 border border-primary-500 rounded px-2 py-1 text-xs w-full focus:outline-none" />
                                <button onClick={applyEdit} className="text-green-400 hover:text-green-300"><CheckCircle className="w-3.5 h-3.5" /></button>
                                <button onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <span onClick={() => startEdit(student.id, col, cellVal)} className="block px-2 py-1.5 cursor-pointer hover:bg-zinc-800/50 rounded text-zinc-300 transition-colors truncate max-w-[120px]">{cellVal || '—'}</span>
                            )}
                          </td>
                        );
                      })}
                      {visibleColumns['photo'] !== false && (
                      <td className="p-3 text-zinc-500 font-mono truncate max-w-[160px]">
                        {student.photoPath ? student.photoPath.split('\\').pop() : 'None'}
                      </td>
                      )}
                    </tr>
                  );
                })}
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
