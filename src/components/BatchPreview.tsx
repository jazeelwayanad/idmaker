import React, { useState, useEffect, useRef } from 'react';
import { useStore, Student } from '../hooks/useStore';
import * as fabric from 'fabric';

if (fabric.FabricObject) {
  (fabric.FabricObject as any).customProperties = [
    'name',
    'photoShape',
    'photoRx',
    'photoRy',
    'photoStroke',
    'photoStrokeWidth',
    'photoFill'
  ];
}
import { 
  Play, Download, CheckSquare, Square, AlertTriangle, Eye, ShieldAlert,
  Search, Filter, ChevronLeft, ChevronRight, FileDown, FolderOpen
} from 'lucide-react';

export default function BatchPreview() {
  const { 
    students, activeTemplate, mappedFields, activeStudentIndex, 
    setStudentIndex, nextStudent, prevStudent, fetchExports, exports, activeProject
  } = useStore();

  const [selectedStudents, setSelectedStudents] = useState<Record<number, boolean>>({});
  const [filterText, setFilterText] = useState('');
  const [exportType, setExportType] = useState<'png' | 'pdf' | 'both'>('pdf');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Preview side selector
  const [activePreviewSideIdx, setActivePreviewSideIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [exportFolder, setExportFolder] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('idmaker_export_folder');
    }
    return null;
  });

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricPreviewRef = useRef<fabric.Canvas | null>(null);
  const fabricHiddenRef = useRef<fabric.Canvas | null>(null);

  // Dynamic resolution dimensions based on template (300 DPI scale)
  const DPI = 300;
  const MM_TO_PX = DPI / 25.4;
  const cardW = Math.round((activeTemplate?.width || 85.6) * MM_TO_PX);
  const cardH = Math.round((activeTemplate?.height || 53.98) * MM_TO_PX);
  const displayScale = Math.min(550 / cardW, 400 / cardH, 0.6);

  // Extract layout settings
  let sidesCount = 2;
  if (activeTemplate?.layout) {
    try {
      const layoutData = JSON.parse(activeTemplate.layout);
      if (layoutData.sidesCount) sidesCount = Number(layoutData.sidesCount);
    } catch (e) {}
  }

  // Helper to extract designs array
  const getDesignsArray = (template: any): string[] => {
    if (!template) return ['{}', '{}'];
    try {
      if (template.frontDesign && template.frontDesign.startsWith('[')) {
        return JSON.parse(template.frontDesign);
      }
      return [template.frontDesign || '{}', template.backDesign || '{}'];
    } catch (e) {
      return ['{}', '{}'];
    }
  };

  const handleSelectExportFolder = async () => {
    if (typeof window === 'undefined' || !window.api) return;
    try {
      const folder = await window.api.files.selectFolder();
      if (folder) {
        setExportFolder(folder);
        localStorage.setItem('idmaker_export_folder', folder);
      }
    } catch (e) {
      console.error('Failed to select export folder:', e);
    }
  };

  const handleClearExportFolder = () => {
    setExportFolder(null);
    localStorage.removeItem('idmaker_export_folder');
  };



  useEffect(() => {
    if (!previewCanvasRef.current || !hiddenCanvasRef.current || !activeTemplate) return;

    // Set up preview canvas
    const pCanvas = new fabric.Canvas(previewCanvasRef.current, {
      width: cardW * displayScale,
      height: cardH * displayScale,
      backgroundColor: '#1e1e24',
      selection: false,
      interactive: false
    });
    fabricPreviewRef.current = pCanvas;

    // Set up hidden renderer canvas for full-resolution exports
    const hCanvas = new fabric.Canvas(hiddenCanvasRef.current, {
      width: cardW,
      height: cardH,
      backgroundColor: '#1e1e24',
      selection: false
    });
    fabricHiddenRef.current = hCanvas;

    // Initialize all checkboxes to true
    const checks: Record<number, boolean> = {};
    students.forEach(s => {
      checks[s.id] = true;
    });
    setSelectedStudents(checks);

    return () => {
      pCanvas.dispose();
      hCanvas.dispose();
      fabricPreviewRef.current = null;
      fabricHiddenRef.current = null;
    };
  }, [students.length, activeTemplate?.id, cardW, cardH]);

  // Update preview canvas zoom and dimensions dynamically
  useEffect(() => {
    const canvas = fabricPreviewRef.current;
    if (!canvas) return;
    canvas.setZoom(zoom);
    canvas.setDimensions({
      width: cardW * displayScale * zoom,
      height: cardH * displayScale * zoom
    });
    canvas.renderAll();
    if (students.length > 0) {
      renderPreview(students[activeStudentIndex], activePreviewSideIdx);
    }
  }, [zoom, cardW, cardH, displayScale]);

  useEffect(() => {
    if (students.length > 0 && fabricPreviewRef.current) {
      renderPreview(students[activeStudentIndex], activePreviewSideIdx);
    }
  }, [activeStudentIndex, students.length, activeTemplate?.frontDesign, activeTemplate?.backDesign, activePreviewSideIdx]);

  const renderPreview = async (student: Student | undefined, sideIdx: number) => {
    const canvas = fabricPreviewRef.current;
    if (!canvas || !activeTemplate || !student) return;

    canvas.clear();
    canvas.backgroundColor = '#1e1e24';

    const designs = getDesignsArray(activeTemplate);
    const design = designs[sideIdx] || '{}';
    if (!design || design === '{}') {
      canvas.renderAll();
      return;
    }

    try {
      const parsed = JSON.parse(design);
      await canvas.loadFromJSON(parsed);
      if (fabricPreviewRef.current !== canvas) return;
      await document.fonts.ready;
      if (fabricPreviewRef.current !== canvas) return;

      // Auto crop outer side of card
      canvas.clipPath = new fabric.Rect({
        left: 0,
        top: 0,
        width: canvas.width,
        height: canvas.height,
        absolutePositioned: true
      });
      
      // Substitute placeholders
      const objects = canvas.getObjects();
      const studentData = JSON.parse(student.data || '{}');

      for (const obj of objects) {
        // Substitute text placeholders
        if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
          const textObj = obj as fabric.Textbox;
          let val = textObj.text || '';
          
          const matches = val.match(/\{[^}]+\}/g);
          if (matches) {
            matches.forEach(m => {
              const colKey = mappedFields[m] || m.replace('{', '').replace('}', '');
              const replacement = studentData[colKey] || '';
              val = val.replace(m, replacement);
            });
            textObj.set('text', val);
          }
        }

        // Render photo
        const isPhoto = (obj as any).name === '{Photo}' || 
                        (obj instanceof fabric.Group && (obj as fabric.Group).getObjects().some(o => (o as any).text === '{Photo}' || (o as any).name === '{Photo}'));
        if (isPhoto && student.photoPath) {
          let left = obj.left;
          let top = obj.top;
          let width = obj.width * obj.scaleX!;
          let height = obj.height * obj.scaleY!;
          
          let photoShape = (obj as any).photoShape || 'rect';
          let rx = (obj as any).photoRx !== undefined ? (obj as any).photoRx : 8;
          let ry = (obj as any).photoRy !== undefined ? (obj as any).photoRy : 8;
          let stroke = (obj as any).photoStroke || '#0284c7';
          let strokeWidth = (obj as any).photoStrokeWidth !== undefined ? (obj as any).photoStrokeWidth : 2;

          if (obj instanceof fabric.Group) {
            const rectObj = obj.getObjects().find(o => o instanceof fabric.Rect || o instanceof fabric.Circle);
            if (rectObj) {
              width = rectObj.width * rectObj.scaleX! * obj.scaleX!;
              height = rectObj.height * rectObj.scaleY! * obj.scaleY!;
            }
          }

          try {
            const normalizedPath = student.photoPath.replace(/\\/g, '/');
            const localPhotoUrl = `local-photo://load/${normalizedPath}`;
            const img = await fabric.Image.fromURL(localPhotoUrl);
              const scale = Math.max(width / img.width!, height / img.height!);
              
              let clip;
              let borderObj;

              if (photoShape === 'circle') {
                const radius = Math.min(width, height) / 2;
                clip = new fabric.Circle({
                  left: left,
                  top: top,
                  radius: radius,
                  absolutePositioned: true
                });
                if (strokeWidth > 0) {
                  borderObj = new fabric.Circle({
                    left: left,
                    top: top,
                    radius: radius - strokeWidth / 2,
                    fill: 'transparent',
                    stroke: stroke,
                    strokeWidth: strokeWidth,
                    selectable: false,
                    evented: false
                  });
                }
              } else {
                clip = new fabric.Rect({
                  left: left,
                  top: top,
                  width: width,
                  height: height,
                  rx: rx * obj.scaleX!,
                  ry: ry * obj.scaleY!,
                  absolutePositioned: true
                });
                if (strokeWidth > 0) {
                  borderObj = new fabric.Rect({
                    left: left,
                    top: top,
                    width: width,
                    height: height,
                    rx: rx * obj.scaleX!,
                    ry: ry * obj.scaleY!,
                    fill: 'transparent',
                    stroke: stroke,
                    strokeWidth: strokeWidth,
                    selectable: false,
                    evented: false
                  });
                }
              }

              img.set({
                left: left + (width - img.width! * scale) / 2,
                top: top + (height - img.height! * scale) / 2,
                scaleX: scale,
                scaleY: scale,
                clipPath: clip
              });

              canvas.remove(obj);
              canvas.add(img);
              if (borderObj) {
                canvas.add(borderObj);
              }
            } catch (e) {
            console.error(e);
          }
        }


      }

      canvas.renderAll();
    } catch (err) {
      console.error(err);
    }
  };

  // Generate a card on the hidden high-res canvas and return data-URL
  const generateHighResCard = async (student: Student, sideIdx: number): Promise<string | null> => {
    const canvas = fabricHiddenRef.current;
    if (!canvas || !activeTemplate) return null;

    const displayScale = Math.min(550 / cardW, 400 / cardH, 0.6);
    const scaleMultiplier = 1 / displayScale;

    const designs = getDesignsArray(activeTemplate);
    const design = designs[sideIdx] || '{}';
    const designHash = design.length + '_' + design.substring(0, 20) + '_' + design.substring(Math.max(0, design.length - 20));
    const cacheKey = `${activeTemplate.id}_${sideIdx}_${designHash}`;
    const isLoaded = (canvas as any).currentCacheKey === cacheKey;

    if (!isLoaded) {
      canvas.clear();
      if (!design || design === '{}') return null;

      try {
        const parsed = JSON.parse(design);
        await canvas.loadFromJSON(parsed);
        if (fabricHiddenRef.current !== canvas) return null;
        await document.fonts.ready;
        if (fabricHiddenRef.current !== canvas) return null;

        // Force hidden canvas size to high resolution
        canvas.setDimensions({ width: cardW, height: cardH });

        // Scale all objects from designer scale to high-res scale
        const objects = canvas.getObjects();
        objects.forEach(obj => {
          obj.left *= scaleMultiplier;
          obj.top *= scaleMultiplier;
          obj.scaleX! *= scaleMultiplier;
          obj.scaleY! *= scaleMultiplier;
          obj.setCoords();
          
          if (obj.type === 'textbox' || obj.type === 'text') {
            (obj as any).originalText = (obj as any).text;
          }
        });

        if (canvas.backgroundImage) {
          const bg = canvas.backgroundImage as fabric.Image;
          bg.scaleX! *= scaleMultiplier;
          bg.scaleY! *= scaleMultiplier;
          bg.left! *= scaleMultiplier;
          bg.top! *= scaleMultiplier;
        }

        // Auto crop outer side of card
        canvas.clipPath = new fabric.Rect({
          left: 0,
          top: 0,
          width: cardW,
          height: cardH,
          absolutePositioned: true
        });

        (canvas as any).currentCacheKey = cacheKey;
      } catch (err) {
        console.error(err);
        return null;
      }
    }

    // Now, the canvas has the template loaded and scaled.
    // 1. Clean up previous dynamic photo objects
    const objects = canvas.getObjects();
    const dynamicObjects = objects.filter(obj => (obj as any).isDynamicPhoto);
    dynamicObjects.forEach(obj => canvas.remove(obj));

    // 2. Restore original text and visibility of original photo placeholders
    objects.forEach(obj => {
      if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
        if ((obj as any).originalText !== undefined) {
          (obj as any).text = (obj as any).originalText;
        }
      }
      const isPhoto = (obj as any).name === '{Photo}' || 
                      (obj instanceof fabric.Group && (obj as fabric.Group).getObjects().some(o => (o as any).text === '{Photo}' || (o as any).name === '{Photo}'));
      if (isPhoto) {
        obj.set({ visible: true });
      }
    });

    // 3. Process student data
    try {
      const studentData = JSON.parse(student.data || '{}');

      for (const obj of objects) {
        if (!obj.visible) continue;

        // Substitute text placeholders
        if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
          const textObj = obj as fabric.Textbox;
          let val = textObj.text || '';
          const matches = val.match(/\{[^}]+\}/g);
          if (matches) {
            matches.forEach(m => {
              const colKey = mappedFields[m] || m.replace('{', '').replace('}', '');
              const replacement = studentData[colKey] || '';
              val = val.replace(m, replacement);
            });
            textObj.set('text', val);
          }
        }

        // Render photo
        const isPhoto = (obj as any).name === '{Photo}' || 
                        (obj instanceof fabric.Group && (obj as fabric.Group).getObjects().some(o => (o as any).text === '{Photo}' || (o as any).name === '{Photo}'));
        if (isPhoto && student.photoPath) {
          let left = obj.left;
          let top = obj.top;
          let width = obj.width * obj.scaleX!;
          let height = obj.height * obj.scaleY!;
          
          let photoShape = (obj as any).photoShape || 'rect';
          let rx = (obj as any).photoRx !== undefined ? (obj as any).photoRx : 8;
          let ry = (obj as any).photoRy !== undefined ? (obj as any).photoRy : 8;
          let stroke = (obj as any).photoStroke || '#0284c7';
          let strokeWidth = (obj as any).photoStrokeWidth !== undefined ? (obj as any).photoStrokeWidth : 2;

          if (obj instanceof fabric.Group) {
            const rectObj = obj.getObjects().find(o => o instanceof fabric.Rect || o instanceof fabric.Circle);
            if (rectObj) {
              width = rectObj.width * rectObj.scaleX! * obj.scaleX!;
              height = rectObj.height * rectObj.scaleY! * obj.scaleY!;
            }
          }

          try {
            const normalizedPath = student.photoPath.replace(/\\/g, '/');
            const localPhotoUrl = `local-photo://load/${normalizedPath}`;
            const img = await fabric.Image.fromURL(localPhotoUrl);
            const scale = Math.max(width / img.width!, height / img.height!);
            
            let clip;
            let borderObj;

            if (photoShape === 'circle') {
              const radius = Math.min(width, height) / 2;
              clip = new fabric.Circle({
                left: left,
                top: top,
                radius: radius,
                absolutePositioned: true
              });
              if (strokeWidth > 0) {
                borderObj = new fabric.Circle({
                  left: left,
                  top: top,
                  radius: radius - strokeWidth / 2,
                  fill: 'transparent',
                  stroke: stroke,
                  strokeWidth: strokeWidth,
                  selectable: false,
                  evented: false
                });
              }
            } else {
              clip = new fabric.Rect({
                left: left,
                top: top,
                width: width,
                height: height,
                rx: rx * obj.scaleX!,
                ry: ry * obj.scaleY!,
                absolutePositioned: true
              });
              if (strokeWidth > 0) {
                borderObj = new fabric.Rect({
                  left: left,
                  top: top,
                  width: width,
                  height: height,
                  rx: rx * obj.scaleX!,
                  ry: ry * obj.scaleY!,
                  fill: 'transparent',
                  stroke: stroke,
                  strokeWidth: strokeWidth,
                  selectable: false,
                  evented: false
                });
              }
            }

            img.set({
              left: left + (width - img.width! * scale) / 2,
              top: top + (height - img.height! * scale) / 2,
              scaleX: scale,
              scaleY: scale,
              clipPath: clip
            });

            obj.set({ visible: false });
            (img as any).isDynamicPhoto = true;
            canvas.add(img);
            if (borderObj) {
              (borderObj as any).isDynamicPhoto = true;
              canvas.add(borderObj);
            }
          } catch (e) {
            console.error(e);
          }
        }
      }

      canvas.renderAll();
      return canvas.toDataURL({ format: 'png', multiplier: 1 });
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const toggleSelectAll = () => {
    const nextChecks: Record<number, boolean> = {};
    const allChecked = Object.values(selectedStudents).every(v => v);
    students.forEach(s => {
      nextChecks[s.id] = !allChecked;
    });
    setSelectedStudents(nextChecks);
  };

  const handleCheckboxChange = (id: number) => {
    setSelectedStudents(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleBulkExport = async () => {
    const listToGenerate = students.filter(s => selectedStudents[s.id]);
    if (listToGenerate.length === 0) {
      alert('Select at least one record to export.');
      return;
    }

    if (typeof window === 'undefined' || !window.api) return;

    setGenerating(true);
    setProgress(0);

    try {
      const generatedCards: { front: string; back?: string; allSides: string[]; data: any }[] = [];

      for (let i = 0; i < listToGenerate.length; i++) {
        const student = listToGenerate[i];
        
        // Generate high resolution card images for all designed sides
        const sidesImages: string[] = [];
        for (let sideIdx = 0; sideIdx < sidesCount; sideIdx++) {
          const img = await generateHighResCard(student, sideIdx);
          if (img) sidesImages.push(img);
        }

        if (sidesImages.length > 0) {
          generatedCards.push({
            front: sidesImages[0],
            back: sidesImages[1] || undefined,
            allSides: sidesImages,
            data: JSON.parse(student.data || '{}')
          });
        }

        setProgress(Math.round(((i + 1) / listToGenerate.length) * 50));
      }

      // Generate output file
      if (exportType === 'pdf' || exportType === 'both') {
        const docSettings = {
          paperSize: activeTemplate?.paperSize || 'A4',
          layout: activeTemplate?.layout ? JSON.parse(activeTemplate.layout) : { rows: 4, cols: 2, margin: 10, spacing: 5, showCropMarks: true },
          cardSize: { width: activeTemplate?.width || 85.6, height: activeTemplate?.height || 53.98 }
        };

        let exportName = activeTemplate?.name || 'ID_Cards';
        if (activeProject?.settings) {
          try {
            const settings = JSON.parse(activeProject.settings);
            if (settings.excelName) {
              exportName = settings.excelName;
            }
          } catch {}
        }

        const targetFile = `${exportName}.pdf`;
        const savePath = await window.api.files.saveFile(targetFile, '', undefined, exportFolder || undefined);
        if (savePath) {
          // Pass the card front and back (PDF exporter expects front/back attributes)
          await window.api.files.exportPdf(savePath, docSettings, generatedCards);
          
          await window.api.exports.create({
            projectId: activeTemplate?.projectId,
            filename: targetFile,
            filePath: savePath,
            type: 'PDF Print Sheet',
            count: listToGenerate.length
          });
          await fetchExports();
        }
      }

      if (exportType === 'png' || exportType === 'both') {
        let exportName = activeTemplate?.name || 'ID_Cards';
        if (activeProject?.settings) {
          try {
            const settings = JSON.parse(activeProject.settings);
            if (settings.excelName) {
              exportName = settings.excelName;
            }
          } catch {}
        }
        const zipName = `${exportName}_Images.zip`;
        const savePath = await window.api.files.saveFile(zipName, '', undefined, exportFolder || undefined);
        
        if (savePath) {
          const zipFiles: { name: string; buffer: ArrayBuffer }[] = [];
          
          for (let idx = 0; idx < generatedCards.length; idx++) {
            const card = generatedCards[idx];
            const name = card.data.registerNo || card.data.RegNo || `card_${idx}`;
            
            // Push all dynamic sides to ZIP bundle
            card.allSides.forEach((sideImg, sIdx) => {
              const buf = Buffer.from(sideImg.replace(/^data:image\/\w+;base64,/, ""), 'base64');
              zipFiles.push({
                name: `${name}_side${sIdx + 1}.png`,
                buffer: buf.buffer
              });
            });
          }

          await window.api.files.exportZip(savePath, zipFiles);

          await window.api.exports.create({
            projectId: activeTemplate?.projectId,
            filename: zipName,
            filePath: savePath,
            type: 'ZIP Bundle',
            count: listToGenerate.length
          });
          await fetchExports();
        }
      }

      setProgress(100);
      alert('Bulk generation completed successfully!');
    } catch (err) {
      console.error(err);
      alert('An error occurred during card generation.');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenFolder = async (filePath: string) => {
    if (typeof window === 'undefined' || !window.api) return;
    const dir = filePath.substring(0, filePath.lastIndexOf('\\'));
    await window.api.files.openDirectory(dir);
  };

  const handleSingleExport = async (student: Student) => {
    if (typeof window === 'undefined' || !window.api || !activeTemplate) return;

    setGenerating(true);
    setProgress(0);

    try {
      const sidesImages: string[] = [];
      for (let sideIdx = 0; sideIdx < sidesCount; sideIdx++) {
        const img = await generateHighResCard(student, sideIdx);
        if (img) sidesImages.push(img);
      }

      if (sidesImages.length === 0) {
        alert('Could not render card design.');
        return;
      }

      const studentData = JSON.parse(student.data || '{}');
      const cleanName = student.name.replace(/[^a-zA-Z0-9]/g, '_');

      if (sidesImages.length === 1) {
        const targetFile = `${cleanName}_Front.png`;
        const base64Clean = sidesImages[0].replace(/^data:image\/\w+;base64,/, "");
        const savePath = await window.api.files.saveFile(targetFile, base64Clean, 'base64');
        if (savePath) {
          await window.api.exports.create({
            projectId: activeTemplate?.projectId,
            filename: targetFile,
            filePath: savePath,
            type: 'Single PNG Image',
            count: 1
          });
          await fetchExports();
          alert('Card exported as PNG successfully!');
        }
      } else {
        const zipName = `${cleanName}_ID_Card.zip`;
        const savePath = await window.api.files.saveFile(zipName, '');
        if (savePath) {
          const zipFiles = sidesImages.map((sideImg, sIdx) => {
            const buf = Buffer.from(sideImg.replace(/^data:image\/\w+;base64,/, ""), 'base64');
            return {
              name: `${cleanName}_side${sIdx + 1}.png`,
              buffer: buf.buffer
            };
          });
          await window.api.files.exportZip(savePath, zipFiles);

          await window.api.exports.create({
            projectId: activeTemplate?.projectId,
            filename: zipName,
            filePath: savePath,
            type: 'ZIP Bundle (Single Card)',
            count: 1
          });
          await fetchExports();
          alert('Card exported as ZIP successfully!');
        }
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while exporting the card.');
    } finally {
      setGenerating(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(filterText.toLowerCase()) || 
    s.registerNo.toLowerCase().includes(filterText.toLowerCase())
  );

  const tabsList = Array.from({ length: sidesCount }).map((_, idx) => `Side ${idx + 1}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Play className="w-6 h-6 text-primary-500" />
            Batch Preview & Export
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Simulate and render dynamic datasets. Generate multi-page print sheets or high-res ZIP bundles.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Student Directory Checklist */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col h-[680px]">
          <div className="flex items-center justify-between mb-4">
            <span className="font-bold text-zinc-200 text-sm">Select Students</span>
            <button 
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors"
            >
              Toggle All
            </button>
          </div>

          <div className="flex items-center gap-2 bg-dark-800 border border-zinc-800 rounded-xl px-3 py-2 text-xs mb-4">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by name or reg no..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="bg-transparent border-none text-zinc-200 outline-none w-full"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredStudents.map((s, idx) => (
              <div 
                key={s.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  activeStudentIndex === students.indexOf(s) 
                    ? 'bg-primary-500/10 border-primary-500/30' 
                    : 'bg-dark-800/40 border-zinc-800 hover:border-zinc-700'
                }`}
                onClick={() => setStudentIndex(students.indexOf(s))}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckboxChange(s.id);
                    }}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    {selectedStudents[s.id] ? (
                      <CheckSquare className="w-4.5 h-4.5 text-primary-500" />
                    ) : (
                      <Square className="w-4.5 h-4.5" />
                    )}
                  </button>
                  <div className="truncate">
                    <p className="font-semibold text-zinc-200 text-xs truncate">{s.name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{s.registerNo}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {!s.photoPath && (
                    <span title="Photo Missing">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSingleExport(s);
                    }}
                    className="p-1.5 bg-dark-800 hover:bg-zinc-800 border border-zinc-700/80 hover:border-zinc-600 rounded-lg text-[10px] font-bold text-zinc-300 transition-all flex items-center gap-1"
                    title="Export this card"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Realtime Card Previewer */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col items-center justify-between h-[680px]">
          <div className="w-full flex flex-col gap-2 border-b border-zinc-800 pb-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200 text-sm flex items-center gap-1.5">
                <Eye className="w-4.5 h-4.5 text-primary-500" /> Live Canvas Render
              </span>
              <span className="text-[10px] bg-dark-800 border border-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-mono">
                Student {activeStudentIndex + 1} of {students.length}
              </span>
            </div>

            {/* Sides preview selector tabs */}
            <div className="flex gap-1 mt-1 bg-dark-900 border border-zinc-800 p-0.5 rounded-lg w-fit">
              {tabsList.map((tab, idx) => (
                <button
                  key={idx}
                  onClick={() => setActivePreviewSideIdx(idx)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                    activePreviewSideIdx === idx 
                      ? 'bg-primary-500 text-white' 
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div 
            style={{ width: '100%', height: '240px' }}
            className="relative border border-zinc-700/40 rounded-xl overflow-auto shadow-xl bg-dark-900 my-4 flex items-center justify-center p-4"
          >
            <div className="shrink-0">
              <canvas ref={previewCanvasRef} />
            </div>
          </div>
          <div className="hidden">
            <canvas ref={hiddenCanvasRef} />
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5 mb-2.5 bg-dark-900/60 border border-zinc-800 p-1 rounded-lg">
            <button 
              onClick={() => setZoom(prev => Math.max(0.2, Number((prev - 0.1).toFixed(1))))} 
              className="w-6 h-6 flex items-center justify-center rounded bg-dark-800 hover:bg-zinc-800 text-zinc-300 font-bold text-xs"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-[10px] text-zinc-300 font-mono font-bold w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(prev => Math.min(3, Number((prev + 0.1).toFixed(1))))} 
              className="w-6 h-6 flex items-center justify-center rounded bg-dark-800 hover:bg-zinc-800 text-zinc-300 font-bold text-xs"
              title="Zoom In"
            >
              +
            </button>
            <button 
              onClick={() => setZoom(1)} 
              className="text-[9px] font-bold text-zinc-400 hover:text-zinc-200 px-1.5"
              title="Reset"
            >
              Reset
            </button>
          </div>



          {/* Controls */}
          <div className="flex items-center gap-4 w-full">
            <button
              onClick={prevStudent}
              disabled={activeStudentIndex === 0}
              className="flex-1 bg-dark-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 rounded-xl py-2 flex items-center justify-center gap-1 text-xs text-zinc-300 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button
              onClick={nextStudent}
              disabled={activeStudentIndex === students.length - 1}
              className="flex-1 bg-dark-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 rounded-xl py-2 flex items-center justify-center gap-1 text-xs text-zinc-300 transition-all"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Export Panel & Logs */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-[680px]">
          <div className="space-y-4">
            <h3 className="font-bold text-zinc-200 text-sm border-b border-zinc-800 pb-3 flex items-center gap-1.5">
              <FileDown className="w-4.5 h-4.5 text-primary-500" /> Export Setup
            </h3>

            {/* Output Type select */}
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Export Target</label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value as any)}
                className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none"
              >
                <option value="pdf">Printable PDF Sheets</option>
                <option value="png">Individual Cards ZIP (PNGs)</option>
                <option value="both">Both PDF and ZIP Bundle</option>
              </select>
            </div>

            {/* Export Destination folder */}
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Export Destination</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  placeholder="Ask for each file (Default)"
                  value={exportFolder || ''}
                  className="flex-1 bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none truncate text-zinc-400"
                  title={exportFolder || 'Default behavior: prompt for each export file'}
                />
                <button
                  onClick={handleSelectExportFolder}
                  className="bg-dark-800 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 px-3 py-2 rounded-lg text-xs font-bold text-zinc-300 transition-colors shrink-0"
                >
                  Browse
                </button>
                {exportFolder && (
                  <button
                    onClick={handleClearExportFolder}
                    className="text-red-400 hover:text-red-300 text-xs font-bold px-1"
                    title="Clear export folder"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {generating ? (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Rendering cards...</span>
                  <span className="font-bold text-primary-500">{progress}%</span>
                </div>
                <div className="w-full bg-dark-800 h-2 rounded-full overflow-hidden border border-zinc-800">
                  <div style={{ width: `${progress}%` }} className="bg-primary-500 h-full transition-all duration-300" />
                </div>
              </div>
            ) : (
              <button
                onClick={handleBulkExport}
                className="w-full bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary-500/20 text-sm"
              >
                <Play className="w-4 h-4 fill-white" />
                Run Bulk Export
              </button>
            )}
          </div>

          {/* Export Log */}
          <div className="flex-1 flex flex-col min-h-0 mt-4">
            <span className="font-bold text-zinc-400 text-[10px] uppercase mb-2 flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-primary-500" /> Export History
            </span>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {exports.map((exp) => (
                <div 
                  key={exp.id} 
                  className="bg-dark-800/50 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate">
                      <p className="font-bold text-zinc-200 text-xs truncate" title={exp.filename}>{exp.filename}</p>
                      <p className="text-[9px] text-zinc-500 font-semibold mt-0.5">{exp.type} • {exp.count} records</p>
                    </div>
                    <button
                      onClick={() => handleOpenFolder(exp.filePath)}
                      className="bg-dark-800 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 p-1.5 rounded-lg text-[10px] font-bold tracking-wide shrink-0 transition-colors"
                      title="Open file folder location"
                    >
                      Locate
                    </button>
                  </div>
                </div>
              ))}
              {exports.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 py-6">
                  <FolderOpen className="w-6 h-6 stroke-[1.5] opacity-50 mb-1" />
                  <p className="text-[10px] font-semibold">No export records yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
