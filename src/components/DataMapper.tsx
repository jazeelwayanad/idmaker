import React, { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { Columns, ArrowRight, Save, Settings } from 'lucide-react';

const autoMatchColumn = (placeholder: string, cols: string[]): string => {
  const cleanPh = placeholder.replace(/[{}]/g, '').toLowerCase().trim();
  
  const matchRules: Record<string, string[]> = {
    name: ['name', 'student name', 'fullname', 'full name', 'employee name', 'member name'],
    regno: ['regno', 'register', 'roll', 'admission', 'id', 'reg no', 'roll no', 'registration', 'register no', 'register number', 'registration number', 'emp id', 'employee id', 'enrollment'],
    photo: ['photo', 'image', 'picture', 'pic', 'img', 'avatar', 'photograph', 'photo path', 'photo name', 'filename']
  };

  // 1. Check exact clean placeholder match
  let matchedCol = cols.find(col => col.toLowerCase().trim() === cleanPh);
  if (matchedCol) return matchedCol;

  // 2. Try to find matching terms for common placeholders
  for (const [key, terms] of Object.entries(matchRules)) {
    if (cleanPh.includes(key) || key.includes(cleanPh)) {
      // Find a column that matches any of the terms exactly
      matchedCol = cols.find(col => terms.includes(col.toLowerCase().trim()));
      if (matchedCol) return matchedCol;
      
      // Find a column that contains any of the terms
      matchedCol = cols.find(col => {
        const lowerCol = col.toLowerCase().trim();
        return terms.some(term => lowerCol.includes(term) || term.includes(lowerCol));
      });
      if (matchedCol) return matchedCol;
    }
  }

  // 3. Fallback: try finding a column that contains cleanPh as a substring, or vice-versa
  matchedCol = cols.find(col => {
    const lowerCol = col.toLowerCase().trim();
    return lowerCol.includes(cleanPh) || cleanPh.includes(lowerCol);
  });
  
  return matchedCol || '';
};

export default function DataMapper() {
  const { activeTemplate, columns, mappedFields, updateMappedFields } = useStore();
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [localMapping, setLocalMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!activeTemplate) return;

    const detected = new Set<string>();
    
    // Parse front design and all sides in array
    if (activeTemplate.frontDesign) {
      try {
        const parsed = JSON.parse(activeTemplate.frontDesign);
        const parseObjects = (designObj: any) => {
          const objects = designObj?.objects || [];
          objects.forEach((obj: any) => {
            if (obj.text && typeof obj.text === 'string') {
              const matches = obj.text.match(/\{[^}]+\}/g);
              if (matches) matches.forEach((m: string) => detected.add(m));
            }
            if (obj.name && obj.name.startsWith('{') && obj.name.endsWith('}')) {
              detected.add(obj.name);
            }
          });
        };

        if (Array.isArray(parsed)) {
          parsed.forEach(designStr => {
            try {
              parseObjects(JSON.parse(designStr));
            } catch (e) {}
          });
        } else {
          parseObjects(parsed);
        }
      } catch (e) {}
    }

    // Parse back design if it exists separately
    if (activeTemplate.backDesign) {
      try {
        const parsed = JSON.parse(activeTemplate.backDesign);
        const objects = parsed.objects || [];
        objects.forEach((obj: any) => {
          if (obj.text && typeof obj.text === 'string') {
            const matches = obj.text.match(/\{[^}]+\}/g);
            if (matches) matches.forEach((m: string) => detected.add(m));
          }
          if (obj.name && obj.name.startsWith('{') && obj.name.endsWith('}')) {
            detected.add(obj.name);
          }
        });
      } catch (e) {}
    }

    // Standard fallback placeholders
    if (detected.size === 0) {
      detected.add('{Name}');
      detected.add('{RegNo}');
      detected.add('{Photo}');
    }

    const placeholderList = Array.from(detected);
    setPlaceholders(placeholderList);

    // Initialize mapping with auto-matching fallbacks
    const initialMapping: Record<string, string> = {};
    placeholderList.forEach(ph => {
      const existing = mappedFields[ph];
      if (existing !== undefined && (existing === '' || columns.includes(existing))) {
        initialMapping[ph] = existing;
      } else {
        initialMapping[ph] = autoMatchColumn(ph, columns);
      }
    });
    setLocalMapping(initialMapping);
  }, [activeTemplate?.id, activeTemplate?.frontDesign, activeTemplate?.backDesign, mappedFields, columns]);

  const handleMapChange = (placeholder: string, colValue: string) => {
    setLocalMapping(prev => ({
      ...prev,
      [placeholder]: colValue
    }));
  };

  const handleSaveMapping = async () => {
    await updateMappedFields(localMapping);
    alert('Field mappings updated successfully!');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary-500" />
          Field Mapping settings
        </h2>
        <p className="text-zinc-400 text-sm mt-1">
          Link spreadsheet data columns to the placeholders inside your ID card design layout.
        </p>
      </div>

      <div className="glass-panel p-6 rounded-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <span className="font-bold text-zinc-200">Map Placeholders</span>
          <button
            onClick={handleSaveMapping}
            className="bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-semibold py-2 px-5 rounded-xl flex items-center gap-1.5 transition-all text-xs"
          >
            <Save className="w-4 h-4" />
            Save Mappings
          </button>
        </div>

        {columns.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm bg-dark-800 rounded-xl border border-zinc-800">
            Please import an Excel file first to view spreadsheet column headers.
          </div>
        ) : (
          <div className="space-y-4">
            {placeholders.map((ph) => {
              const matchedCol = localMapping[ph] || '';
              return (
                <div 
                  key={ph}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-dark-800/60 border border-zinc-800/80 rounded-xl gap-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="bg-primary-500/10 text-primary-400 font-bold px-3 py-1.5 rounded-lg text-xs font-mono border border-primary-500/10">
                      {ph}
                    </div>
                    <span className="text-zinc-500 text-xs font-medium">in Canvas</span>
                  </div>

                  <ArrowRight className="hidden sm:block w-4 h-4 text-zinc-600" />

                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 text-xs">Mapped Column:</span>
                    <select
                      value={matchedCol}
                      onChange={(e) => handleMapChange(ph, e.target.value)}
                      className="bg-dark-900 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary-500 transition-colors min-w-[200px]"
                    >
                      <option value="">-- Choose Excel Column --</option>
                      {columns.map((col, idx) => (
                        <option key={idx} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto detect alert */}
      <div className="bg-primary-500/5 border border-primary-500/10 rounded-2xl p-5 flex items-start gap-3">
        <Columns className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-zinc-200 text-sm">Smart Auto-Detect Mapping</h4>
          <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
            The system attempts to auto-match similar names during file import (e.g. "student name" or "fullname" binds automatically to <code>{`{Name}`}</code>). Correct any misalignments above.
          </p>
        </div>
      </div>
    </div>
  );
}
