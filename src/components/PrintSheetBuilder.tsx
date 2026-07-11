import React, { useEffect, useState, useRef } from 'react';
import { useStore, Student } from '../hooks/useStore';
import { Grid, Ruler, FileText, Upload, Image as ImageIcon, Plus, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
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

interface LayoutSettings {
  rows: number;
  cols: number;
  margin: number;
  spacing: number;
  showCropMarks: boolean;
  layoutMode?: 'grid' | 'custom';
  maxCards?: number;
  cardPositions?: Array<{ x: number; y: number }>;
}

const DPI = 300;
const MM_TO_PX = DPI / 25.4;

export default function PrintSheetBuilder() {
  const { activeTemplate, saveTemplate, students, mappedFields, activeProject } = useStore();

  const [paperSize, setPaperSize] = useState('A4');
  const [customW, setCustomW] = useState(210);
  const [customH, setCustomH] = useState(297);
  const [layout, setLayout] = useState<LayoutSettings>({
    rows: 4,
    cols: 2,
    margin: 10,
    spacing: 5,
    showCropMarks: true,
    layoutMode: 'grid',
    maxCards: 8,
    cardPositions: []
  });
  const [bgImage, setBgImage] = useState<string | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);

  const alignSelectedCards = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedCards.length < 2) return;
    
    const positions = [...(layout.cardPositions || [])];
    const count = layout.maxCards !== undefined ? layout.maxCards : (layout.cols * layout.rows || 8);
    for (let i = 0; i < count; i++) {
      if (!positions[i]) {
        positions[i] = getStandardGridPos(i);
      }
    }

    const selectedPositions = selectedCards.map(idx => positions[idx]);
    
    if (alignment === 'left') {
      const minX = Math.min(...selectedPositions.map(p => p.x));
      selectedCards.forEach(idx => {
        positions[idx] = { ...positions[idx], x: minX };
      });
    } else if (alignment === 'right') {
      const maxX = Math.max(...selectedPositions.map(p => p.x));
      selectedCards.forEach(idx => {
        positions[idx] = { ...positions[idx], x: maxX };
      });
    } else if (alignment === 'center') {
      const minX = Math.min(...selectedPositions.map(p => p.x));
      const maxX = Math.max(...selectedPositions.map(p => p.x));
      const centerX = (minX + maxX) / 2;
      selectedCards.forEach(idx => {
        positions[idx] = { ...positions[idx], x: centerX };
      });
    } else if (alignment === 'top') {
      const minY = Math.min(...selectedPositions.map(p => p.y));
      selectedCards.forEach(idx => {
        positions[idx] = { ...positions[idx], y: minY };
      });
    } else if (alignment === 'bottom') {
      const maxY = Math.max(...selectedPositions.map(p => p.y));
      selectedCards.forEach(idx => {
        positions[idx] = { ...positions[idx], y: maxY };
      });
    } else if (alignment === 'middle') {
      const minY = Math.min(...selectedPositions.map(p => p.y));
      const maxY = Math.max(...selectedPositions.map(p => p.y));
      const centerY = (minY + maxY) / 2;
      selectedCards.forEach(idx => {
        positions[idx] = { ...positions[idx], y: centerY };
      });
    }

    handleUpdateLayout('cardPositions', positions);
  };

  const distributeSelectedCards = (direction: 'horizontal' | 'vertical') => {
    if (selectedCards.length < 3) return;

    const positions = [...(layout.cardPositions || [])];
    const count = layout.maxCards !== undefined ? layout.maxCards : (layout.cols * layout.rows || 8);
    for (let i = 0; i < count; i++) {
      if (!positions[i]) {
        positions[i] = getStandardGridPos(i);
      }
    }

    const sortedIndices = [...selectedCards].sort((a, b) => {
      const posA = positions[a];
      const posB = positions[b];
      return direction === 'horizontal' ? posA.x - posB.x : posA.y - posB.y;
    });

    const firstIdx = sortedIndices[0];
    const lastIdx = sortedIndices[sortedIndices.length - 1];

    if (direction === 'horizontal') {
      const minX = positions[firstIdx].x;
      const maxX = positions[lastIdx].x;
      if (maxX !== minX) {
        const step = (maxX - minX) / (sortedIndices.length - 1);
        sortedIndices.forEach((idx, i) => {
          positions[idx] = { ...positions[idx], x: minX + i * step };
        });
      }
    } else {
      const minY = positions[firstIdx].y;
      const maxY = positions[lastIdx].y;
      if (maxY !== minY) {
        const step = (maxY - minY) / (sortedIndices.length - 1);
        sortedIndices.forEach((idx, i) => {
          positions[idx] = { ...positions[idx], y: minY + i * step };
        });
      }
    }

    handleUpdateLayout('cardPositions', positions);
  };

  // Hidden high-res canvas for PDF exports
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricHiddenRef = useRef<fabric.Canvas | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const parseLayout = (layoutStr: string | null | undefined): Record<string, any> => {
    if (!layoutStr) return {};
    try {
      const parsed = JSON.parse(layoutStr);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {}
    return {};
  };

  // Card dimensions from template or default (mm)
  const cardW = activeTemplate?.width || 85.6;
  const cardH = activeTemplate?.height || 53.98;
  const cardAspect = cardW / cardH;

  // Helper to compute standard grid slot coordinate for a card index
  const getStandardGridPos = (idx: number, currentCols?: number, currentMargin?: number, currentSpacing?: number) => {
    const cols = currentCols !== undefined ? currentCols : layout.cols;
    const margin = currentMargin !== undefined ? currentMargin : layout.margin;
    const spacing = currentSpacing !== undefined ? currentSpacing : layout.spacing;
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const x = margin + c * (cardW + spacing);
    const y = margin + r * (cardH + spacing);
    return { x, y };
  };

  // Sync activeTemplate state updates to local state variables instantly
  useEffect(() => {
    if (activeTemplate) {
      setPaperSize(activeTemplate.paperSize || 'A4');
      const parsed = parseLayout(activeTemplate.layout);
      setLayout(prev => {
        const nextMode = parsed.layoutMode || 'grid';
        const defaultMaxCards = parsed.cols * parsed.rows || 8;
        return {
          ...prev,
          ...parsed,
          layoutMode: nextMode,
          maxCards: parsed.maxCards !== undefined ? parsed.maxCards : defaultMaxCards,
          cardPositions: parsed.cardPositions || []
        };
      });
      if (parsed.customW) setCustomW(parsed.customW);
      if (parsed.customH) setCustomH(parsed.customH);
      if (parsed.bgImage !== undefined) setBgImage(parsed.bgImage);
    }
  }, [activeTemplate]);

  // Setup Fabric high resolution hidden canvas
  useEffect(() => {
    if (hiddenCanvasRef.current) {
      const hCanvas = new fabric.Canvas(hiddenCanvasRef.current, {
        width: 1011,
        height: 638,
        backgroundColor: '#1e1e24',
        selection: false
      });
      fabricHiddenRef.current = hCanvas;
      return () => {
        hCanvas.dispose();
        fabricHiddenRef.current = null;
      };
    }
  }, []);

  // Pointer event dragging logic for custom draggable cards (prevents Framer Motion transform offset issues)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
    e.preventDefault();

    if (layout.layoutMode === 'custom') {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        setSelectedCards(prev => 
          prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
      } else {
        setSelectedCards(prev => prev.includes(idx) ? prev : [idx]);
      }
    }

    const cardEl = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    
    const pos = (layout.cardPositions && layout.cardPositions[idx]) || getStandardGridPos(idx);
    const startLeft = pos.x;
    const startTop = pos.y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / previewScale;
      const deltaY = (moveEvent.clientY - startY) / previewScale;
      
      const newX = startLeft + deltaX;
      const newY = startTop + deltaY;
      
      const maxX = paper.w - cardW;
      const maxY = paper.h - cardH;
      const finalX = Math.max(0, Math.min(maxX, newX));
      const finalY = Math.max(0, Math.min(maxY, newY));
      
      cardEl.style.left = `${finalX * previewScale}px`;
      cardEl.style.top = `${finalY * previewScale}px`;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      const deltaX = (upEvent.clientX - startX) / previewScale;
      const deltaY = (upEvent.clientY - startY) / previewScale;
      const newX = Math.round(startLeft + deltaX);
      const newY = Math.round(startTop + deltaY);
      
      const maxX = paper.w - cardW;
      const maxY = paper.h - cardH;
      const finalX = Math.max(0, Math.min(maxX, newX));
      const finalY = Math.max(0, Math.min(maxY, newY));

      const newPositions = [...(layout.cardPositions || [])];
      for (let i = 0; i < (layout.maxCards || 8); i++) {
        if (!newPositions[i]) {
          newPositions[i] = getStandardGridPos(i);
        }
      }
      newPositions[idx] = { x: finalX, y: finalY };
      handleUpdateLayout('cardPositions', newPositions);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

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

  // Render a card high resolution front/back png base64
  const generateHighResCard = async (student: Student, sideIdx: number): Promise<string | null> => {
    const canvas = fabricHiddenRef.current;
    if (!canvas || !activeTemplate) return null;

    const cardWPx = Math.round((activeTemplate.width || 85.6) * MM_TO_PX);
    const cardHPx = Math.round((activeTemplate.height || 53.98) * MM_TO_PX);
    const displayScale = Math.min(550 / cardWPx, 400 / cardHPx, 0.6);
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

        canvas.setDimensions({ width: cardWPx, height: cardHPx });

        const objects = canvas.getObjects();
        objects.forEach(obj => {
          obj.left *= scaleMultiplier;
          obj.top *= scaleMultiplier;
          obj.scaleX! *= scaleMultiplier;
          obj.scaleY! *= scaleMultiplier;
          obj.setCoords();

          if (obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') {
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

        (canvas as any).currentCacheKey = cacheKey;
      } catch (err) {
        console.error(err);
        return null;
      }
    }

    // Now, the canvas has the template loaded.
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

  const handleExportPdf = async () => {
    if (typeof window === 'undefined' || !window.api || students.length === 0) return;

    setGenerating(true);
    setProgress(0);

    try {
      const generatedCards: { front: string; back?: string; allSides: string[]; data: any }[] = [];
      let sidesCount = 2;
      if (activeTemplate?.layout) {
        try {
          const layoutData = JSON.parse(activeTemplate.layout);
          if (layoutData.sidesCount) sidesCount = Number(layoutData.sidesCount);
        } catch (e) {}
      }

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
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
        setProgress(Math.round(((i + 1) / students.length) * 100));
      }

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
      const savePath = await window.api.files.saveFile(targetFile, '');
      if (savePath) {
        await window.api.files.exportPdf(savePath, docSettings, generatedCards);
        await window.api.exports.create({
          projectId: activeTemplate?.projectId,
          filename: targetFile,
          filePath: savePath,
          type: 'PDF Print Sheet',
          count: students.length
        });
        alert(`Successfully exported PDF sheet to:\n${savePath}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Failed to export PDF: ${err.message || err}`);
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  };

  const handleUpdateLayout = (key: keyof LayoutSettings, val: any) => {
    const next = { ...layout, [key]: val };
    
    if ((key === 'cols' || key === 'rows') && (!layout.layoutMode || layout.layoutMode === 'grid')) {
      next.maxCards = next.cols * next.rows;
    }
    
    setLayout(next);
    const currentLayout = parseLayout(activeTemplate?.layout);
    saveTemplate({
      paperSize,
      layout: JSON.stringify({ ...currentLayout, ...next, customW, customH, bgImage })
    });
  };

  const handlePaperSizeChange = (size: string) => {
    setPaperSize(size);
    const currentLayout = parseLayout(activeTemplate?.layout);
    saveTemplate({
      paperSize: size,
      layout: JSON.stringify({ ...currentLayout, ...layout, customW, customH, bgImage })
    });
  };

  const handleCustomDimChange = (key: 'customW' | 'customH', val: number) => {
    if (key === 'customW') setCustomW(val);
    else setCustomH(val);
    setPaperSize('Custom');
    const currentLayout = parseLayout(activeTemplate?.layout);
    saveTemplate({
      paperSize: 'Custom',
      layout: JSON.stringify({ ...currentLayout, ...layout, customW: key === 'customW' ? val : customW, customH: key === 'customH' ? val : customH, bgImage })
    });
  };

  // Background image upload handler
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setBgImage(dataUrl);
      const currentLayout = parseLayout(activeTemplate?.layout);
      saveTemplate({
        paperSize,
        layout: JSON.stringify({ ...currentLayout, ...layout, customW, customH, bgImage: dataUrl })
      });
    };
    reader.readAsDataURL(file);
  };

  const clearBg = () => {
    setBgImage(null);
    const currentLayout = parseLayout(activeTemplate?.layout);
    saveTemplate({
      paperSize,
      layout: JSON.stringify({ ...currentLayout, ...layout, customW, customH, bgImage: null })
    });
  };

  // Align custom cards to grid coordinates
  const alignToGrid = () => {
    const newPositions: Array<{ x: number; y: number }> = [];
    const count = layout.maxCards !== undefined ? layout.maxCards : (layout.cols * layout.rows || 8);
    for (let i = 0; i < count; i++) {
      newPositions.push(getStandardGridPos(i));
    }
    handleUpdateLayout('cardPositions', newPositions);
  };

  // Paper dimensions
  const paperDimensions: Record<string, { w: number; h: number }> = {
    'A4': { w: 210, h: 297 },
    'A3': { w: 297, h: 420 },
    'Letter': { w: 215.9, h: 279.4 },
    'Legal': { w: 215.9, h: 355.6 },
    'Custom': { w: customW, h: customH },
  };

  const paper = paperDimensions[paperSize] || { w: customW, h: customH };

  // Preview Scale factor - fit into ~450px height
  const previewScale = Math.min(450 / paper.h, 500 / paper.w) * zoom;

  // Auto-calculate best grid that fits
  const autoCalcGrid = () => {
    const usableW = paper.w - layout.margin * 2;
    const usableH = paper.h - layout.margin * 2;
    const maxCols = Math.floor((usableW + layout.spacing) / (cardW + layout.spacing));
    const maxRows = Math.floor((usableH + layout.spacing) / (cardH + layout.spacing));
    const next = { ...layout, cols: Math.max(1, maxCols), rows: Math.max(1, maxRows) };
    if (!layout.layoutMode || layout.layoutMode === 'grid') {
      next.maxCards = next.cols * next.rows;
    }
    setLayout(next);
    const currentLayout = parseLayout(activeTemplate?.layout);
    saveTemplate({ paperSize, layout: JSON.stringify({ ...currentLayout, ...next, customW, customH, bgImage }) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <Grid className="w-6 h-6 text-primary-500" />
          Print Sheet Builder
        </h2>
        <p className="text-zinc-400 text-sm mt-1">
          Lay out cards onto printable sheets with custom paper sizes, background images, and auto-ratio grids.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="glass-panel p-6 rounded-2xl space-y-5 lg:col-span-1 overflow-y-auto max-h-[600px]">
          <h3 className="font-bold text-zinc-200 text-sm border-b border-zinc-800 pb-3 flex items-center gap-1.5">
            <Ruler className="w-4 h-4 text-primary-500" /> Layout Metrics
          </h3>

          {/* Layout Mode Selection */}
          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Layout Mode</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-dark-800/80 border border-zinc-800 rounded-xl">
              <button
                type="button"
                onClick={() => handleUpdateLayout('layoutMode', 'grid')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                  (layout.layoutMode || 'grid') === 'grid'
                    ? 'bg-primary-500 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Automatic Grid
              </button>
              <button
                type="button"
                onClick={() => handleUpdateLayout('layoutMode', 'custom')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                  layout.layoutMode === 'custom'
                    ? 'bg-primary-500 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Custom Drag
              </button>
            </div>
          </div>

          {/* Paper Selection */}
          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Paper Format</label>
            <select
              value={paperSize}
              onChange={(e) => handlePaperSizeChange(e.target.value)}
              className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none"
            >
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="A3">A3 (297 × 420 mm)</option>
              <option value="Letter">Letter (8.5" × 11")</option>
              <option value="Legal">Legal (8.5" × 14")</option>
              <option value="Custom">Custom Size</option>
            </select>
          </div>

          {/* Custom Size */}
          {paperSize === 'Custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Width (mm)</label>
                <input
                  type="number"
                  value={customW}
                  min={50}
                  onChange={(e) => handleCustomDimChange('customW', Number(e.target.value))}
                  className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Height (mm)</label>
                <input
                  type="number"
                  value={customH}
                  min={50}
                  onChange={(e) => handleCustomDimChange('customH', Number(e.target.value))}
                  className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Card Info */}
          <div className="p-3 bg-dark-800/50 border border-zinc-800 rounded-xl">
            <span className="text-zinc-500 text-[10px] uppercase font-bold">Card Size (from template)</span>
            <p className="text-zinc-200 text-sm font-semibold mt-1">{cardW} × {cardH} mm</p>
            <p className="text-zinc-500 text-[10px] mt-0.5">Aspect Ratio: {cardAspect.toFixed(2)} : 1</p>
          </div>

          {/* Card Count Field */}
          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Cards Per Page</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleUpdateLayout('maxCards', Math.max(1, (layout.maxCards || 8) - 1))}
                className="bg-dark-800 border border-zinc-800 rounded-lg p-1.5 hover:border-zinc-700"
              >
                <Minus className="w-3 h-3 text-zinc-400" />
              </button>
              <input
                type="number"
                value={layout.maxCards !== undefined ? layout.maxCards : (layout.cols * layout.rows || 8)}
                min={1}
                max={50}
                onChange={(e) => handleUpdateLayout('maxCards', Math.max(1, Number(e.target.value)))}
                className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none text-center"
              />
              <button
                type="button"
                onClick={() => handleUpdateLayout('maxCards', Math.min(50, (layout.maxCards || 8) + 1))}
                className="bg-dark-800 border border-zinc-800 rounded-lg p-1.5 hover:border-zinc-700"
              >
                <Plus className="w-3 h-3 text-zinc-400" />
              </button>
            </div>
          </div>

          {(layout.layoutMode || 'grid') === 'grid' ? (
            <>
              {/* Grid Rows & Cols */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Grid Columns</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleUpdateLayout('cols', Math.max(1, layout.cols - 1))} className="bg-dark-800 border border-zinc-800 rounded-lg p-1.5 hover:border-zinc-700"><Minus className="w-3 h-3 text-zinc-400" /></button>
                    <input
                      type="number"
                      value={layout.cols}
                      min={1} max={10}
                      onChange={(e) => handleUpdateLayout('cols', Number(e.target.value))}
                      className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none text-center"
                    />
                    <button onClick={() => handleUpdateLayout('cols', Math.min(10, layout.cols + 1))} className="bg-dark-800 border border-zinc-800 rounded-lg p-1.5 hover:border-zinc-700"><Plus className="w-3 h-3 text-zinc-400" /></button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Grid Rows</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleUpdateLayout('rows', Math.max(1, layout.rows - 1))} className="bg-dark-800 border border-zinc-800 rounded-lg p-1.5 hover:border-zinc-700"><Minus className="w-3 h-3 text-zinc-400" /></button>
                    <input
                      type="number"
                      value={layout.rows}
                      min={1} max={20}
                      onChange={(e) => handleUpdateLayout('rows', Number(e.target.value))}
                      className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none text-center"
                    />
                    <button onClick={() => handleUpdateLayout('rows', Math.min(20, layout.rows + 1))} className="bg-dark-800 border border-zinc-800 rounded-lg p-1.5 hover:border-zinc-700"><Plus className="w-3 h-3 text-zinc-400" /></button>
                  </div>
                </div>
              </div>

              {/* Auto-fit button */}
              <button
                onClick={autoCalcGrid}
                className="w-full bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 text-primary-400 font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs"
              >
                <Grid className="w-3.5 h-3.5" />
                Auto-Fit Cards to Paper
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={alignToGrid}
              className="w-full bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 text-primary-400 font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs"
            >
              <Ruler className="w-3.5 h-3.5" />
              Align All Cards to Grid
            </button>
          )}

          {layout.layoutMode === 'custom' && selectedCards.length > 0 && (
            <div className="bg-dark-800/40 border border-zinc-800/80 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between border-b border-zinc-800/50 pb-1.5">
                <label className="text-[10px] text-zinc-500 font-bold uppercase block">
                  Card Selection ({selectedCards.length})
                </label>
                <button 
                  onClick={() => setSelectedCards([])}
                  className="text-[9px] text-zinc-400 hover:text-zinc-200 font-semibold"
                >
                  Clear Selection
                </button>
              </div>

              {selectedCards.length >= 2 && (
                <>
                  <label className="text-[9px] text-zinc-500 font-bold uppercase block mt-1">Align Cards</label>
                  <div className="grid grid-cols-6 gap-1">
                    <button 
                      onClick={() => alignSelectedCards('left')} 
                      className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                      title="Align Left"
                    >
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="4" y1="2" x2="4" y2="22"></line><rect x="8" y="5" width="12" height="6" rx="1"></rect><rect x="8" y="14" width="8" height="5" rx="1"></rect></svg>
                    </button>
                    <button 
                      onClick={() => alignSelectedCards('center')} 
                      className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                      title="Align Horizontal Center"
                    >
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"></line><rect x="6" y="5" width="12" height="5" rx="1"></rect><rect x="8" y="14" width="8" height="5" rx="1"></rect></svg>
                    </button>
                    <button 
                      onClick={() => alignSelectedCards('right')} 
                      className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                      title="Align Right"
                    >
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="20" y1="2" x2="20" y2="22"></line><rect x="4" y="5" width="12" height="6" rx="1"></rect><rect x="8" y="14" width="8" height="5" rx="1"></rect></svg>
                    </button>
                    <button 
                      onClick={() => alignSelectedCards('top')} 
                      className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                      title="Align Top"
                    >
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="4" x2="22" y2="4"></line><rect x="5" y="8" width="6" height="12" rx="1"></rect><rect x="14" y="8" width="5" height="8" rx="1"></rect></svg>
                    </button>
                    <button 
                      onClick={() => alignSelectedCards('middle')} 
                      className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                      title="Align Vertical Center"
                    >
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"></line><rect x="5" y="6" width="6" height="12" rx="1"></rect><rect x="14" y="8" width="5" height="8" rx="1"></rect></svg>
                    </button>
                    <button 
                      onClick={() => alignSelectedCards('bottom')} 
                      className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                      title="Align Bottom"
                    >
                      <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="20" x2="22" y2="20"></line><rect x="5" y="4" width="6" height="12" rx="1"></rect><rect x="14" y="10" width="5" height="8" rx="1"></rect></svg>
                    </button>
                  </div>
                </>
              )}

              {selectedCards.length >= 3 && (
                <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-zinc-800/40">
                  <button 
                    onClick={() => distributeSelectedCards('horizontal')} 
                    className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 py-1.5 px-2 rounded border border-zinc-700 flex items-center justify-center gap-1.5 text-[10px] font-bold" 
                    title="Distribute Center Horizontally"
                  >
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="4" y1="2" x2="4" y2="22"></line><line x1="20" y1="2" x2="20" y2="22"></line><rect x="9" y="7" width="6" height="10" rx="1"></rect></svg>
                    Distribute H
                  </button>
                  <button 
                    onClick={() => distributeSelectedCards('vertical')} 
                    className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 py-1.5 px-2 rounded border border-zinc-700 flex items-center justify-center gap-1.5 text-[10px] font-bold" 
                    title="Distribute Center Vertically"
                  >
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="4" x2="22" y2="4"></line><line x1="20" y1="2" x2="20" y2="22"></line><rect x="7" y="9" width="10" height="6" rx="1"></rect></svg>
                    Distribute V
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Margin & Spacing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Margins (mm)</label>
              <input
                type="number"
                value={layout.margin}
                min={0} max={50}
                onChange={(e) => handleUpdateLayout('margin', Number(e.target.value))}
                className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Gap Spacing (mm)</label>
              <input
                type="number"
                value={layout.spacing}
                min={0} max={20}
                onChange={(e) => handleUpdateLayout('spacing', Number(e.target.value))}
                className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Crop Marks */}
          <div className="flex items-center justify-between p-3 bg-dark-800/50 border border-zinc-800 rounded-xl">
            <span className="text-zinc-300 text-xs font-semibold">Enable Crop Marks</span>
            <input
              type="checkbox"
              checked={layout.showCropMarks}
              onChange={(e) => handleUpdateLayout('showCropMarks', e.target.checked)}
              className="accent-primary-500 w-4 h-4"
            />
          </div>

          {/* Background Upload */}
          <div className="border-t border-zinc-800/80 pt-4 space-y-2">
            <label className="text-[10px] text-zinc-500 font-bold uppercase block">Sheet Background Image</label>
            <input type="file" accept="image/*,.pdf" onChange={handleBgUpload} className="hidden" id="print-bg-upload" />
            <label
              htmlFor="print-bg-upload"
              className="w-full bg-dark-800 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all text-xs"
            >
              <ImageIcon className="w-3.5 h-3.5" /> Upload Background
            </label>
            {bgImage && (
              <button onClick={clearBg} className="w-full text-[10px] text-red-400 hover:text-red-300 font-semibold">
                Remove Background
              </button>
            )}
          </div>

          {/* Print/Export PDF Button */}
          <div className="border-t border-zinc-800/80 pt-4 space-y-2">
            <label className="text-[10px] text-zinc-500 font-bold uppercase block">Export Sheet</label>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={generating || students.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-3.5 h-3.5" />
              {generating ? `Exporting (${progress}%)` : 'Export Print Sheet to PDF'}
            </button>
            {students.length === 0 && (
              <p className="text-[9px] text-yellow-500 text-center">⚠ Please import Excel data first to export cards.</p>
            )}
          </div>
        </div>

        {/* Visual Canvas Representation */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl flex flex-col items-center justify-center min-h-[500px]">
          <div className="flex items-center justify-between w-full mb-4">
            <span className="font-bold text-zinc-400 text-xs uppercase flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-500" /> Interactive Sheet Layout
              <span className="text-[10px] bg-primary-500/10 border border-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full lowercase font-normal normal-case">
                {layout.layoutMode === 'custom' ? 'Drag cards to position' : 'Drag grid to adjust margin'}
              </span>
            </span>
            <span className="text-[10px] bg-dark-800 border border-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-mono">
              {paper.w} × {paper.h} mm • {layout.layoutMode === 'custom' ? layout.maxCards : layout.cols * layout.rows} cards/page
            </span>
          </div>

          <div className="relative border border-zinc-700/50 rounded-xl overflow-auto shadow-2xl bg-dark-900 max-w-full max-h-[550px] p-6 flex items-center justify-center w-full">
            <div
              ref={paperRef}
              onClick={() => setSelectedCards([])}
              style={{
                width: paper.w * previewScale,
                height: paper.h * previewScale,
                position: 'relative',
                backgroundImage: bgImage ? `url("${bgImage}")` : undefined,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
              className="bg-white border border-zinc-300 shadow-xl rounded overflow-hidden shrink-0"
            >
              {/* Margins */}
              <div
                style={{
                  position: 'absolute',
                  top: layout.margin * previewScale,
                  bottom: layout.margin * previewScale,
                  left: layout.margin * previewScale,
                  right: layout.margin * previewScale,
                  border: '1px dashed rgba(2, 132, 199, 0.4)',
                  pointerEvents: 'none'
                }}
              />

              {/* Layout Cards */}
              {layout.layoutMode === 'custom' ? (
                // Custom Mode: Render individual draggable cards (using pointer events for perfect positioning)
                Array.from({ length: layout.maxCards || 8 }).map((_, idx) => {
                  const pos = (layout.cardPositions && layout.cardPositions[idx]) || getStandardGridPos(idx);
                  const isSelected = selectedCards.includes(idx);
                  return (
                    <div
                      key={idx}
                      onPointerDown={(e) => handlePointerDown(e, idx)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        left: pos.x * previewScale,
                        top: pos.y * previewScale,
                        width: cardW * previewScale,
                        height: cardH * previewScale,
                        cursor: 'grab',
                        touchAction: 'none'
                      }}
                      className={`border rounded flex flex-col items-center justify-center text-[10px] font-semibold transition-colors shadow select-none ${
                        isSelected
                          ? 'border-primary-500 ring-2 ring-primary-500 bg-primary-500/20 text-primary-200'
                          : bgImage
                          ? 'bg-zinc-200/30 border-zinc-500/40 text-zinc-800 backdrop-blur-[1px]'
                          : 'bg-zinc-200/80 border-zinc-400/80 text-zinc-500'
                      }`}
                    >
                      <span>Card {idx + 1}</span>
                      <span className="text-[8px] opacity-75">{cardW} × {cardH} mm</span>
                    </div>
                  );
                })
              ) : (
                // Grid Mode: Render standard grid
                <motion.div
                  drag
                  dragConstraints={{
                    top: 0,
                    left: 0,
                    right: Math.max(0, (paper.w - (layout.cols * cardW + (layout.cols - 1) * layout.spacing)) * previewScale),
                    bottom: Math.max(0, (paper.h - (layout.rows * cardH + (layout.rows - 1) * layout.spacing)) * previewScale),
                  }}
                  dragElastic={0.1}
                  dragMomentum={false}
                  onDragEnd={(event, info) => {
                    const deltaMarginX = info.offset.x / previewScale;
                    const deltaMarginY = info.offset.y / previewScale;
                    const avgDelta = (deltaMarginX + deltaMarginY) / 2;
                    const newMargin = Math.max(0, Math.min(50, Math.round(layout.margin + avgDelta)));
                    handleUpdateLayout('margin', newMargin);
                  }}
                  style={{
                    position: 'absolute',
                    top: layout.margin * previewScale,
                    left: layout.margin * previewScale,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${layout.cols}, ${cardW * previewScale}px)`,
                    gridTemplateRows: `repeat(${layout.rows}, ${cardH * previewScale}px)`,
                    gap: `${layout.spacing * previewScale}px`,
                    cursor: 'grab'
                  }}
                  whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
                >
                  {Array.from({ length: layout.maxCards !== undefined ? layout.maxCards : (layout.rows * layout.cols) }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: cardW * previewScale,
                        height: cardH * previewScale,
                      }}
                      className={`border rounded flex flex-col items-center justify-center text-[10px] font-semibold transition-all ${
                        bgImage
                          ? 'bg-zinc-200/30 border-zinc-500/40 text-zinc-800 backdrop-blur-[1px]'
                          : 'bg-zinc-200/80 border-zinc-400/80 text-zinc-500'
                      }`}
                    >
                      <span>Card {idx + 1}</span>
                      <span className="text-[8px] opacity-75">{cardW} × {cardH} mm</span>
                    </div>
                  ))}
                </motion.div>
              )}
 
              {/* Overflow warning */}
              {layout.layoutMode !== 'custom' && (layout.margin * 2 + layout.cols * cardW + (layout.cols - 1) * layout.spacing > paper.w ||
                layout.margin * 2 + layout.rows * cardH + (layout.rows - 1) * layout.spacing > paper.h) && (
                <div className="absolute bottom-2 left-2 right-2 bg-red-500/90 text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg text-center">
                  ⚠ Cards overflow the paper boundaries. Reduce rows/cols or increase paper size.
                </div>
              )}
            </div>
          </div>
 
          {/* Zoom Controls */}
          <div className="flex items-center gap-2 mt-4 bg-dark-900/80 border border-zinc-800 p-1.5 rounded-xl shadow-lg shrink-0">
            <button 
              onClick={() => setZoom(prev => Math.max(0.2, Number((prev - 0.1).toFixed(1))))} 
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark-800 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-sm transition-colors"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-xs text-zinc-300 px-2 font-mono font-bold w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(prev => Math.min(3, Number((prev + 0.1).toFixed(1))))} 
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark-800 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-sm transition-colors"
              title="Zoom In"
            >
              +
            </button>
            <div className="w-px h-5 bg-zinc-800 mx-1"></div>
            <button 
              onClick={() => setZoom(1)} 
              className="px-2.5 h-8 flex items-center justify-center rounded-lg bg-dark-800 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition-colors"
              title="Reset to 100%"
            >
              100%
            </button>
            <button 
              onClick={() => setZoom(0.8)} 
              className="px-2.5 h-8 flex items-center justify-center rounded-lg bg-dark-800 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold transition-colors"
              title="Fit Screen"
            >
              Fit
            </button>
          </div>
        </div>
      </div>
      {/* Hidden high-res canvas container */}
      <canvas ref={hiddenCanvasRef} className="hidden" />
    </div>
  );
}
