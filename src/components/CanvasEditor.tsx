import React, { useEffect, useRef, useState } from 'react';
import { useStore, Template } from '../hooks/useStore';
import { loadTemplateToCanvas } from '../utils/canvasHelper';
import * as fabric from 'fabric';
import { 
  Square, Type, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Trash2, RotateCw, Copy, Layers, Save, Undo, Redo, Columns, CheckSquare, Upload,
  Settings, Maximize, Circle, ArrowUp, ArrowDown, ChevronRight, Eye, EyeOff, Lock, Unlock,
  Plus, Minus, RefreshCw, Move, HelpCircle, Bold, Italic, Underline, Baseline, Type as TextIcon,
  MousePointer, Grid, FlipHorizontal, FlipVertical
} from 'lucide-react';

if (fabric.FabricObject) {
  (fabric.FabricObject as any).customProperties = [
    'name',
    'photoShape',
    'photoRx',
    'photoRy',
    'photoStroke',
    'photoStrokeWidth',
    'photoFill',
    'isAppBackground'
  ];
}

const CARD_PRESETS: Record<string, { w: number; h: number; label: string }> = {
  'cr80': { w: 85.6, h: 53.98, label: 'CR-80 Standard (85.6 Ã— 54 mm)' },
  'cr79': { w: 83.9, h: 51.0, label: 'CR-79 (83.9 Ã— 51 mm)' },
  'a7': { w: 74, h: 105, label: 'A7 (74 Ã— 105 mm)' },
  'a6': { w: 105, h: 148, label: 'A6 (105 Ã— 148 mm)' },
  'custom': { w: 85.6, h: 53.98, label: 'Custom Size' },
};

const DPI = 300;
const MM_TO_PX = DPI / 25.4;

export default function CanvasEditor() {
  const { activeProject, activeTemplate, saveTemplate, cardFields } = useStore();
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  
  const [selectedTool, setSelectedTool] = useState<'select' | 'text'>('select');
  const [selectedObj, setSelectedObj] = useState<fabric.FabricObject | null>(null);
  const [canvasObjects, setCanvasObjects] = useState<fabric.FabricObject[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSetup, setShowSetup] = useState(true);

  // Card dimensions
  const [cardPreset, setCardPreset] = useState('cr80');
  const [cardWidthMM, setCardWidthMM] = useState(85.6);
  const [cardHeightMM, setCardHeightMM] = useState(53.98);

  // Element styles states
  const [fontFamily, setFontFamily] = useState('Outfit');
  const [fontSize, setFontSize] = useState(24);
  const [textColor, setTextColor] = useState('#ffffff');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle, setFontStyle] = useState('normal');
  const [underline, setUnderline] = useState(false);
  const [linethrough, setLinethrough] = useState(false);
  const [textBackgroundColor, setTextBackgroundColor] = useState('transparent');
  const [lineHeight, setLineHeight] = useState(1.16);
  const [charSpacing, setCharSpacing] = useState(0);
  const [textContent, setTextContent] = useState('');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(100);

  // Geometry properties
  const [selectedLeft, setSelectedLeft] = useState(0);
  const [selectedTop, setSelectedTop] = useState(0);
  const [selectedWidth, setSelectedWidth] = useState(0);
  const [selectedHeight, setSelectedHeight] = useState(0);

  // Photo settings
  const [photoShape, setPhotoShape] = useState<'rect' | 'circle'>('rect');
  const [photoRx, setPhotoRx] = useState(8);
  const [photoRy, setPhotoRy] = useState(8);
  const [photoStroke, setPhotoStroke] = useState('#0284c7');
  const [photoStrokeWidth, setPhotoStrokeWidth] = useState(2);
  const [photoFill, setPhotoFill] = useState('#2a2a35');

  // Sidebar Tab selector
  const [activeLeftTab, setActiveLeftTab] = useState<'variables' | 'layers'>('variables');

  const clipboardRef = useRef<fabric.FabricObject | null>(null);

  const cardW = Math.round(cardWidthMM * MM_TO_PX);
  const cardH = Math.round(cardHeightMM * MM_TO_PX);
  const displayScale = Math.min(480 / cardW, 340 / cardH, 0.65);

  // Load system fonts
  useEffect(() => {
    const fetchFonts = async () => {
      try {
        if ((window as any).api?.files?.getSystemFonts) {
          const fonts = await (window as any).api.files.getSystemFonts();
          setSystemFonts(fonts);
        }
      } catch (err) {
        console.error('Error fetching system fonts:', err);
      }
    };
    fetchFonts();
  }, []);

  // Update canvas sizing
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    
    if (canvas.width !== cardW || canvas.height !== cardH) {
      canvas.setDimensions({ width: cardW, height: cardH }, { backstoreOnly: true });
      canvas.setDimensions({ width: `${cardW}px`, height: `${cardH}px` }, { cssOnly: true });
      
      const bgImg = canvas.getObjects().find(o => (o as any).isAppBackground);
      if (bgImg) {
        const element = (bgImg as any)._element as HTMLImageElement | null;
        const imgWidth = element ? (element.naturalWidth || element.width) : (bgImg.width || cardW);
        const imgHeight = element ? (element.naturalHeight || element.height) : (bgImg.height || cardH);
        bgImg.set({
          scaleX: cardW / imgWidth,
          scaleY: cardH / imgHeight
        });
      }
      canvas.renderAll();
    }
  }, [cardW, cardH]);

  // Load initial template properties
  useEffect(() => {
    if (activeTemplate) {
      if (activeTemplate.width && activeTemplate.height) {
        setCardWidthMM(activeTemplate.width);
        setCardHeightMM(activeTemplate.height);
        
        const matchedPreset = Object.entries(CARD_PRESETS).find(
          ([k, v]) => k !== 'custom' && Math.abs(v.w - activeTemplate.width) < 0.5 && Math.abs(v.h - activeTemplate.height) < 0.5
        );
        setCardPreset(matchedPreset ? matchedPreset[0] : 'custom');

        let isConfigured = false;
        if (activeTemplate.layout) {
          try {
            const layoutData = JSON.parse(activeTemplate.layout);
            if (layoutData.isConfigured) isConfigured = true;
          } catch (e) {}
        }
        setShowSetup(!isConfigured);
      }
    }
  }, [activeTemplate?.id]);

  const handlePresetChange = (preset: string) => {
    setCardPreset(preset);
    if (preset !== 'custom') {
      const p = CARD_PRESETS[preset];
      setCardWidthMM(p.w);
      setCardHeightMM(p.h);
    }
  };

  const handleApplySetup = async () => {
    const activeLayout = activeTemplate?.layout ? JSON.parse(activeTemplate.layout) : {};
    activeLayout.sidesCount = 1; 
    activeLayout.isConfigured = true;

    await saveTemplate({ 
      width: cardWidthMM, 
      height: cardHeightMM, 
      unit: 'mm',
      layout: JSON.stringify(activeLayout)
    });
    setShowSetup(false);
  };

  // Keyboard Nudge, Undo, Redo, Copy, Paste, Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA' || 
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      const nudge = e.shiftKey ? 10 : 1;

      if (e.key === 'ArrowUp') {
        activeObj.set('top', activeObj.top - nudge);
        activeObj.setCoords(); canvas.renderAll(); e.preventDefault(); triggerAutoSave();
      } else if (e.key === 'ArrowDown') {
        activeObj.set('top', activeObj.top + nudge);
        activeObj.setCoords(); canvas.renderAll(); e.preventDefault(); triggerAutoSave();
      } else if (e.key === 'ArrowLeft') {
        activeObj.set('left', activeObj.left - nudge);
        activeObj.setCoords(); canvas.renderAll(); e.preventDefault(); triggerAutoSave();
      } else if (e.key === 'ArrowRight') {
        activeObj.set('left', activeObj.left + nudge);
        activeObj.setCoords(); canvas.renderAll(); e.preventDefault(); triggerAutoSave();
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !(activeObj as any).isEditing) {
        deleteSelected();
        e.preventDefault();
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'c') {
          copyToClipboard(); e.preventDefault();
        } else if (e.key.toLowerCase() === 'v') {
          pasteFromClipboard(); e.preventDefault();
        } else if (e.key.toLowerCase() === 'z') {
          handleUndo(); e.preventDefault();
        } else if (e.key.toLowerCase() === 'y') {
          handleRedo(); e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObj, historyIndex, history]);

  const copyToClipboard = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (!activeObj) return;
    activeObj.clone().then((cloned) => {
      clipboardRef.current = cloned;
    });
  };

  const pasteFromClipboard = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !clipboardRef.current) return;
    clipboardRef.current.clone().then((clonedObj) => {
      canvas.discardActiveObject();
      clonedObj.set({
        left: clonedObj.left + 25,
        top: clonedObj.top + 25,
        evented: true,
      });
      canvas.add(clonedObj);
      if (clipboardRef.current) {
        clipboardRef.current.top += 25;
        clipboardRef.current.left += 25;
      }
      canvas.setActiveObject(clonedObj);
      canvas.requestRenderAll();
      syncObjectsList();
      saveToHistory();
      triggerAutoSave();
    });
  };

  // Initialize Canvas
  useEffect(() => {
    if (showSetup || !canvasRef.current) return;

    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: cardW,
      height: cardH,
      backgroundColor: '#18181b',
      selection: true,
    });

    fabricCanvasRef.current = canvas;
    (canvas as any).isHiRes = true;

    canvas.on('selection:created', (e) => {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        setSelectedObj(activeObj);
        updateStyleControls(activeObj);
      }
    });
    canvas.on('selection:updated', (e) => {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        setSelectedObj(activeObj);
        updateStyleControls(activeObj);
      }
    });
    canvas.on('selection:cleared', () => setSelectedObj(null));

    canvas.on('object:modified', () => {
      syncObjectsList();
      saveToHistory();
      triggerAutoSave();
    });
    canvas.on('object:moving', (e) => { if (e.target) updateStyleControls(e.target); });
    canvas.on('object:scaling', (e) => { if (e.target) updateStyleControls(e.target); });
    canvas.on('object:rotating', (e) => { if (e.target) updateStyleControls(e.target); });

    canvas.on('text:selection:changed', (e) => {
      const activeObj = canvas.getActiveObject();
      if (activeObj && (activeObj as any).isEditing) {
        const txt = activeObj as fabric.Textbox;
        setCachedSelection({
          start: txt.selectionStart || 0,
          end: txt.selectionEnd || 0,
          id: (txt as any)._cachedId || ((txt as any)._cachedId = Math.random().toString(36).substr(2, 9))
        });
        updateStyleControls(activeObj);
      }
    });

    loadDesignData();

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [activeTemplate?.id, showSetup, cardW, cardH]);

  const syncObjectsList = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const objs = canvas.getObjects().filter(o => !(o as any).isAppBackground);
    setCanvasObjects([...objs].reverse());
  };

  const loadDesignData = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTemplate) return;

    let designJson = activeTemplate.frontDesign || '{}';
    if (designJson.startsWith('[')) {
      try {
        const list = JSON.parse(designJson);
        designJson = list[0] || '{}';
      } catch (e) {}
    }

    await loadTemplateToCanvas(canvas, designJson, cardW, cardH, {
      isPreview: false,
      displayScale: displayScale
    });
    syncObjectsList();
    saveToHistory(true);
  };

  const updateStyleControls = (obj: fabric.FabricObject) => {
    setRotation(Math.round(obj.angle || 0));
    setSelectedLeft(Math.round(obj.left || 0));
    setSelectedTop(Math.round(obj.top || 0));
    setSelectedWidth(Math.round(obj.width * (obj.scaleX || 1)));
    setSelectedHeight(Math.round(obj.height * (obj.scaleY || 1)));
    setOpacity(Math.round((obj.opacity ?? 1) * 100));

    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const textObj = obj as fabric.Textbox;
      let activeStyle: any = {};
      if (textObj.isEditing) {
        activeStyle = textObj.getSelectionStyles(textObj.selectionStart, textObj.selectionStart + 1)[0] || {};
      }
      setFontFamily(activeStyle.fontFamily || textObj.fontFamily || 'Outfit');
      setFontSize(Math.round(activeStyle.fontSize || textObj.fontSize || 24));
      setTextColor(activeStyle.fill || textObj.fill as string || '#ffffff');
      setFontWeight(String(activeStyle.fontWeight || textObj.fontWeight || 'normal'));
      setFontStyle(activeStyle.fontStyle || textObj.fontStyle || 'normal');
      setUnderline(activeStyle.underline !== undefined ? !!activeStyle.underline : !!textObj.underline);
      setLinethrough(activeStyle.linethrough !== undefined ? !!activeStyle.linethrough : !!textObj.linethrough);
      setTextBackgroundColor(activeStyle.textBackgroundColor || textObj.textBackgroundColor || 'transparent');
      setLineHeight(textObj.lineHeight || 1.16);
      setCharSpacing(textObj.charSpacing || 0);
      setTextContent(textObj.text || '');
    } else if ((obj as any).name === '{Photo}' || obj.type === 'group') {
      setPhotoShape((obj as any).photoShape || 'rect');
      setPhotoRx((obj as any).photoRx !== undefined ? (obj as any).photoRx : 8);
      setPhotoRy((obj as any).photoRy !== undefined ? (obj as any).photoRy : 8);
      setPhotoStroke((obj as any).photoStroke || '#0284c7');
      setPhotoStrokeWidth((obj as any).photoStrokeWidth !== undefined ? (obj as any).photoStrokeWidth : 2);
      setPhotoFill((obj as any).photoFill || '#2a2a35');
    }
  };

  const saveToHistory = (clear = false) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const serialized = (canvas as any).toJSON(['name', 'photoShape', 'photoRx', 'photoRy', 'photoStroke', 'photoStrokeWidth', 'photoFill', 'isAppBackground']);
    serialized.isHiRes = true;
    const json = JSON.stringify(serialized);
    if (clear) {
      setHistory([json]);
      setHistoryIndex(0);
    } else {
      const nextHist = history.slice(0, historyIndex + 1);
      nextHist.push(json);
      setHistory(nextHist);
      setHistoryIndex(nextHist.length - 1);
    }
  };

  const handleUndo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || historyIndex <= 0) return;
    const prev = historyIndex - 1;
    setHistoryIndex(prev);
    canvas.loadFromJSON(JSON.parse(history[prev])).then(() => {
      canvas.renderAll();
      syncObjectsList();
      triggerAutoSave();
    });
  };

  const handleRedo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || historyIndex >= history.length - 1) return;
    const next = historyIndex + 1;
    setHistoryIndex(next);
    canvas.loadFromJSON(JSON.parse(history[next])).then(() => {
      canvas.renderAll();
      syncObjectsList();
      triggerAutoSave();
    });
  };

  const addTextVariable = (field: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const textObj = new fabric.Textbox(`{${field}}`, {
      left: Math.round(cardW * 0.15),
      top: Math.round(cardH * 0.4),
      width: Math.round(cardW * 0.7),
      fontSize: 28,
      fontFamily: 'Outfit',
      fill: '#ffffff',
      fontWeight: 'normal',
      textAlign: 'center',
      borderColor: '#0284c7',
      cornerColor: '#0284c7',
      cornerSize: 8,
      transparentCorners: false
    });
    canvas.add(textObj);
    canvas.setActiveObject(textObj);
    canvas.renderAll();
    syncObjectsList();
    saveToHistory();
    triggerAutoSave();
  };

  const addPhotoPlaceholder = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const w = Math.round(cardW * 0.35);
    const h = Math.round(cardH * 0.4);
    const x = Math.round((cardW - w) / 2);
    const y = Math.round(cardH * 0.15);

    const rect = new fabric.Rect({
      left: 0, top: 0,
      width: w, height: h,
      fill: '#2a2a35',
      stroke: '#0284c7',
      strokeWidth: 2,
      rx: 8, ry: 8,
      name: 'bg',
      borderColor: '#0284c7', cornerColor: '#0284c7'
    } as any);

    const label = new fabric.Textbox('{Photo}', {
      left: 5,
      top: h / 2 - 10,
      width: w - 10,
      fontSize: 20,
      fontFamily: 'Outfit',
      fill: '#8c8c9e',
      textAlign: 'center',
      selectable: false
    });

    const group = new fabric.Group([rect, label], {
      left: x, top: y,
      name: '{Photo}', borderColor: '#0284c7', cornerColor: '#0284c7', transparentCorners: false
    } as any);

    (group as any).photoShape = 'rect';
    (group as any).photoRx = 8;
    (group as any).photoRy = 8;
    (group as any).photoStroke = '#0284c7';
    (group as any).photoStrokeWidth = 2;
    (group as any).photoFill = '#2a2a35';

    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
    syncObjectsList();
    saveToHistory();
    triggerAutoSave();
  };
const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  const canvas = fabricCanvasRef.current;

  if (!file || !canvas) return;

  const reader = new FileReader();

  reader.onload = async (event) => {
    const imgUrl = event.target?.result as string;

    try {
      const img = await fabric.Image.fromURL(imgUrl);

      const element = (img as any)._element as HTMLImageElement | null;
      const imgWidth = element ? (element.naturalWidth || element.width) : (img.width || cardW);
      const imgHeight = element ? (element.naturalHeight || element.height) : (img.height || cardH);

      // Remove previous background
      canvas.getObjects().forEach((obj) => {
        if ((obj as any).isAppBackground) {
          canvas.remove(obj);
        }
      });

      img.set({
        originX: "left",
        originY: "top",

        left: 0,
        top: 0,

        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        objectCaching: false
      });

      img.scaleX = cardW / imgWidth;
      img.scaleY = cardH / imgHeight;

      (img as any).isAppBackground = true;

      canvas.insertAt(0, img);

      img.setCoords();
      canvas.requestRenderAll();

      syncObjectsList();
      saveToHistory();
      triggerAutoSave();
    } catch (err) {
      console.error("Background upload failed:", err);
    }
  };

  reader.readAsDataURL(file);
};

  const [cachedSelection, setCachedSelection] = useState<{start: number, end: number, id: string | null}>({start: 0, end: 0, id: null});

  const applyStyleToText = (obj: fabric.Textbox, styleObj: any) => {
    const objId = (obj as any)._cachedId || ((obj as any)._cachedId = Math.random().toString(36).substr(2, 9));
    const isEditing = obj.isEditing && obj.selectionStart !== obj.selectionEnd;
    const hasCached = cachedSelection.id === objId && cachedSelection.start !== cachedSelection.end;

    if (isEditing || hasCached) {
      const start = isEditing ? obj.selectionStart : cachedSelection.start;
      const end = isEditing ? obj.selectionEnd : cachedSelection.end;
      const origStart = obj.selectionStart;
      const origEnd = obj.selectionEnd;
      obj.selectionStart = start;
      obj.selectionEnd = end;
      obj.setSelectionStyles(styleObj);
      obj.selectionStart = origStart;
      obj.selectionEnd = origEnd;
    } else {
      obj.set(styleObj);
    }
  };

  const modifyFontFamily = (family: string) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      applyStyleToText(obj as fabric.Textbox, { fontFamily: family });
      setFontFamily(family);
      canvas.renderAll();
      if (document.fonts) {
        document.fonts.load(`12px "${family}"`).then(() => {
          canvas.renderAll(); triggerAutoSave();
        });
      }
    }
    saveToHistory();
  };

  const modifyFontSize = (size: number) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      applyStyleToText(obj as fabric.Textbox, { fontSize: size });
      setFontSize(size);
      canvas.renderAll(); saveToHistory(); triggerAutoSave();
    }
  };

  const modifyColor = (color: string) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const txt = obj as fabric.Textbox;
      if (txt.isEditing && txt.selectionStart !== txt.selectionEnd) {
        txt.setSelectionStyles({ fill: color });
      } else {
        txt.set('fill', color);
      }
      setTextColor(color);
      canvas.renderAll(); saveToHistory(); triggerAutoSave();
    } else {
      obj.set('fill', color);
      canvas.renderAll(); saveToHistory(); triggerAutoSave();
    }
  };

  const modifyWeight = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const txt = obj as fabric.Textbox;
      const next = fontWeight === 'normal' ? 'bold' : 'normal';
      if (txt.isEditing && txt.selectionStart !== txt.selectionEnd) {
        txt.setSelectionStyles({ fontWeight: next });
      } else {
        txt.set('fontWeight', next);
      }
      setFontWeight(next);
      canvas.renderAll(); saveToHistory(); triggerAutoSave();
    }
  };

  const modifyFontStyle = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const txt = obj as fabric.Textbox;
      const next = fontStyle === 'normal' ? 'italic' : 'normal';
      if (txt.isEditing && txt.selectionStart !== txt.selectionEnd) {
        txt.setSelectionStyles({ fontStyle: next });
      } else {
        txt.set('fontStyle', next);
      }
      setFontStyle(next);
      canvas.renderAll(); saveToHistory(); triggerAutoSave();
    }
  };

  const modifyUnderline = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const txt = obj as fabric.Textbox;
      const next = !underline;
      if (txt.isEditing && txt.selectionStart !== txt.selectionEnd) {
        txt.setSelectionStyles({ underline: next });
      } else {
        txt.set('underline', next);
      }
      setUnderline(next);
      canvas.renderAll(); saveToHistory(); triggerAutoSave();
    }
  };

  const modifyAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('textAlign', align);
      canvas.renderAll(); saveToHistory(); triggerAutoSave();
    }
  };

  const modifyTextContent = (text: string) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('text', text);
      setTextContent(text);
      canvas.renderAll(); triggerAutoSave();
    }
  };

  const modifyPosition = (axis: 'left' | 'top' | 'width' | 'height', val: number) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (axis === 'left') {
      obj.set('left', val); setSelectedLeft(val);
    } else if (axis === 'top') {
      obj.set('top', val); setSelectedTop(val);
    } else if (axis === 'width') {
      obj.set('scaleX', val / obj.width); setSelectedWidth(val);
    } else if (axis === 'height') {
      obj.set('scaleY', val / obj.height); setSelectedHeight(val);
    }
    obj.setCoords(); canvas.renderAll(); saveToHistory(); triggerAutoSave();
  };

  const modifyOpacity = (value: number) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    const next = Math.max(0, Math.min(100, value));
    obj.set('opacity', next / 100);
    setOpacity(next);
    canvas.renderAll(); saveToHistory(); triggerAutoSave();
  };

  const toggleFlip = (axis: 'x' | 'y') => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    obj.set(axis === 'x' ? 'flipX' : 'flipY', axis === 'x' ? !obj.flipX : !obj.flipY);
    obj.setCoords(); canvas.renderAll(); saveToHistory(); triggerAutoSave();
  };

  const updatePhotoFrame = (updates: { shape?: 'rect' | 'circle'; radius?: number; stroke?: string; strokeWidth?: number; fill?: string }) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj as fabric.Group | null;
    if (!canvas || !obj || (obj as any).name !== '{Photo}') return;

    const shape = updates.shape ?? ((obj as any).photoShape || 'rect');
    const radius = Math.max(0, Number(updates.radius ?? ((obj as any).photoRx ?? 8)) || 0);
    const stroke = updates.stroke ?? ((obj as any).photoStroke || '#0284c7');
    const strokeWidth = Math.max(0, Number(updates.strokeWidth ?? ((obj as any).photoStrokeWidth ?? 2)) || 0);
    const fill = updates.fill ?? ((obj as any).photoFill || '#2a2a35');

    const visualLeft = obj.left || 0;
    const visualTop = obj.top || 0;
    const visualWidth = Math.max(12, obj.getScaledWidth());
    const visualHeight = Math.max(12, obj.getScaledHeight());
    const centerX = visualLeft + visualWidth / 2;
    const centerY = visualTop + visualHeight / 2;
    const nextWidth = shape === 'circle' ? Math.min(visualWidth, visualHeight) : visualWidth;
    const nextHeight = shape === 'circle' ? nextWidth : visualHeight;
    const nextLeft = shape === 'circle' ? centerX - nextWidth / 2 : visualLeft;
    const nextTop = shape === 'circle' ? centerY - nextHeight / 2 : visualTop;

    const frame = shape === 'circle'
      ? new fabric.Circle({
          left: 0,
          top: 0,
          radius: nextWidth / 2,
          fill,
          stroke,
          strokeWidth,
          name: 'bg',
          borderColor: '#0284c7',
          cornerColor: '#0284c7'
        } as any)
      : new fabric.Rect({
          left: 0,
          top: 0,
          width: nextWidth,
          height: nextHeight,
          fill,
          stroke,
          strokeWidth,
          rx: radius,
          ry: radius,
          name: 'bg',
          borderColor: '#0284c7',
          cornerColor: '#0284c7'
        } as any);

    const label = new fabric.Textbox('{Photo}', {
      left: 5,
      top: nextHeight / 2 - 10,
      width: Math.max(20, nextWidth - 10),
      fontSize: Math.max(10, Math.min(20, nextWidth / 5)),
      fontFamily: 'Outfit',
      fill: '#8c8c9e',
      textAlign: 'center',
      selectable: false,
      evented: false
    });

    const replacementGroup = new fabric.Group([frame, label], {
      left: nextLeft,
      top: nextTop,
      angle: obj.angle || 0,
      opacity: obj.opacity ?? 1,
      flipX: obj.flipX,
      flipY: obj.flipY,
      name: '{Photo}',
      borderColor: '#0284c7',
      cornerColor: '#0284c7',
      transparentCorners: false
    } as any);

    (replacementGroup as any).photoShape = shape;
    (replacementGroup as any).photoRx = radius;
    (replacementGroup as any).photoRy = radius;
    (replacementGroup as any).photoStroke = stroke;
    (replacementGroup as any).photoStrokeWidth = strokeWidth;
    (replacementGroup as any).photoFill = fill;

    const oldIndex = canvas.getObjects().indexOf(obj);
    canvas.remove(obj);
    canvas.insertAt(oldIndex >= 0 ? oldIndex : canvas.getObjects().length, replacementGroup);
    canvas.setActiveObject(replacementGroup);
    setSelectedObj(replacementGroup);
    setSelectedWidth(Math.round(nextWidth));
    setSelectedHeight(Math.round(nextHeight));
    setSelectedLeft(Math.round(nextLeft));
    setSelectedTop(Math.round(nextTop));
    setPhotoShape(shape);
    setPhotoRx(radius);
    setPhotoRy(radius);
    setPhotoStroke(stroke);
    setPhotoStrokeWidth(strokeWidth);
    setPhotoFill(fill);

    replacementGroup.setCoords();
    canvas.renderAll();
    syncObjectsList();
    saveToHistory();
    triggerAutoSave();
  };
  const deleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    canvas.remove(obj);
    canvas.discardActiveObject();
    setSelectedObj(null);
    canvas.renderAll();
    syncObjectsList();
    saveToHistory();
    triggerAutoSave();
  };

  const alignToCanvas = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj || obj.type === 'activeSelection') return;

    const width = obj.width * obj.scaleX!;
    const height = obj.height * obj.scaleY!;

    if (alignment === 'left') obj.set('left', 0);
    else if (alignment === 'center') obj.set('left', (cardW - width) / 2);
    else if (alignment === 'right') obj.set('left', cardW - width);
    else if (alignment === 'top') obj.set('top', 0);
    else if (alignment === 'middle') obj.set('top', (cardH - height) / 2);
    else if (alignment === 'bottom') obj.set('top', cardH - height);

    obj.setCoords(); canvas.renderAll(); saveToHistory(); triggerAutoSave();
    updateStyleControls(obj);
  };

  const moveLayer = (obj: fabric.FabricObject, direction: 'front' | 'back' | 'up' | 'down') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !obj) return;

    if (direction === 'front') {
      canvas.bringObjectToFront(obj);
    } else if (direction === 'back') {
      const bgImg = canvas.getObjects().find(o => (o as any).isAppBackground);
      if (bgImg) {
        const bgIdx = canvas.getObjects().indexOf(bgImg);
        const curIdx = canvas.getObjects().indexOf(obj);
        if (curIdx > bgIdx + 1) canvas.moveObjectTo(obj, bgIdx + 1);
      } else {
        canvas.sendObjectToBack(obj);
      }
    } else if (direction === 'up') {
      canvas.bringObjectForward(obj);
    } else if (direction === 'down') {
      const bgImg = canvas.getObjects().find(o => (o as any).isAppBackground);
      const bgIdx = bgImg ? canvas.getObjects().indexOf(bgImg) : -1;
      const curIdx = canvas.getObjects().indexOf(obj);
      if (curIdx > bgIdx + 1) canvas.moveObjectTo(obj, curIdx - 1);
    }
    canvas.renderAll();
    syncObjectsList();
    saveToHistory();
    triggerAutoSave();
  };

  const toggleLayerLock = (obj: fabric.FabricObject) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !obj) return;
    const isLocked = !obj.lockMovementX;
    obj.set({
      lockMovementX: isLocked, lockMovementY: isLocked,
      lockScalingX: isLocked, lockScalingY: isLocked,
      lockRotation: isLocked, hasControls: !isLocked,
    });
    canvas.renderAll();
    syncObjectsList();
    saveToHistory();
    triggerAutoSave();
    setSelectedObj(obj);
  };

  const handleSave = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTemplate) return;

    const bgImg = canvas.getObjects().find(o => (o as any).isAppBackground);
    if (bgImg) {
      bgImg.set({
        originX: "left",
        originY: "top",
        left: 0,
        top: 0
      });
      bgImg.setCoords();
    }

    const serialized = (canvas as any).toJSON(['name', 'photoShape', 'photoRx', 'photoRy', 'photoStroke', 'photoStrokeWidth', 'photoFill', 'isAppBackground']);
    serialized.isHiRes = true;
    const data = JSON.stringify(serialized);

    await saveTemplate({ 
      frontDesign: JSON.stringify([data]),
      backDesign: '{}'
    });
    alert('Template design successfully saved!');
  };

  const triggerAutoSave = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTemplate) return;

    const bgImg = canvas.getObjects().find(o => (o as any).isAppBackground);
    if (bgImg) {
      bgImg.set({
        originX: "left",
        originY: "top",
        left: 0,
        top: 0
      });
      bgImg.setCoords();
    }

    const serialized = (canvas as any).toJSON(['name', 'photoShape', 'photoRx', 'photoRy', 'photoStroke', 'photoStrokeWidth', 'photoFill', 'isAppBackground']);
    serialized.isHiRes = true;
    const data = JSON.stringify(serialized);

    saveTemplate({ 
      frontDesign: JSON.stringify([data]),
      backDesign: '{}'
    });
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€ SETUP DIALOGUE â”€â”€â”€â”€â”€â”€â”€â”€
  if (showSetup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] p-6 bg-[#0e0e10]">
        <div className="p-8 rounded-2xl w-full max-w-md bg-dark-900 shadow-2xl space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-500/10 rounded-2xl mb-4">
              <Settings className="w-7 h-7 text-primary-500" />
            </div>
            <h2 className="text-lg font-black uppercase tracking-wider text-zinc-100">Card Setup</h2>
            <p className="text-zinc-500 text-xs mt-1">Configure layout sizing for single-sided card printing.</p>
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Preset Dimension</label>
            <select
              value={cardPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full bg-dark-800 border-none rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none"
            >
              {Object.entries(CARD_PRESETS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Width (mm)</label>
              <input
                type="number"
                value={cardWidthMM}
                step={0.1}
                onChange={(e) => { setCardWidthMM(Number(e.target.value)); setCardPreset('custom'); }}
                className="w-full bg-dark-800 border-none rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Height (mm)</label>
              <input
                type="number"
                value={cardHeightMM}
                step={0.1}
                onChange={(e) => { setCardHeightMM(Number(e.target.value)); setCardPreset('custom'); }}
                className="w-full bg-dark-800 border-none rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-dark-800/40 rounded-xl p-4 text-center">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Canvas Resolution (300 DPI)</p>
            <p className="text-zinc-200 font-bold text-base mt-1 font-mono">
              {Math.round(cardWidthMM * MM_TO_PX)} &times; {Math.round(cardHeightMM * MM_TO_PX)} px
            </p>
          </div>

          <button
            onClick={handleApplySetup}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 rounded-xl text-xs tracking-wider uppercase transition-colors"
          >
            Create Canvas &rarr;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-[#0e0e10] rounded-2xl overflow-hidden text-zinc-350 relative shadow-xl">
      
      {/* PHOTOSHOP TOP OPTIONS BAR */}
      <div className="h-12 bg-[#141416] px-4 flex items-center justify-between shrink-0 text-xs shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-[10px] uppercase tracking-wider text-zinc-500">Document</span>
          <span className="text-zinc-300 font-bold font-mono text-[11px] bg-dark-900 px-2 py-0.5 rounded">
            {cardWidthMM} &times; {cardHeightMM} mm ({Math.round(cardWidthMM * MM_TO_PX)} &times; {Math.round(cardHeightMM * MM_TO_PX)} px)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-20 text-zinc-400 hover:text-zinc-200 transition-colors" title="Undo (Ctrl+Z)">
            <Undo className="w-4 h-4" />
          </button>
          <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-zinc-800 rounded disabled:opacity-20 text-zinc-400 hover:text-zinc-200 transition-colors" title="Redo (Ctrl+Y)">
            <Redo className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-zinc-800 mx-1"></div>
          <button onClick={handleSave} className="flex items-center gap-1.5 bg-primary-500 hover:bg-primary-600 text-white px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-md">
            <Save className="w-3.5 h-3.5" /> Save Template
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">

        {/* LEFT PANEL: Variables & Layers tabbed panel with no border borders */}
        <div className="w-64 bg-[#141416] flex flex-col shrink-0 shadow-lg">
          {/* Tab selector */}
          <div className="flex bg-[#121214]">
            <button
              onClick={() => setActiveLeftTab('variables')}
              className={`flex-1 py-2.5 text-[10px] uppercase font-bold tracking-wider transition-all ${
                activeLeftTab === 'variables' 
                  ? 'text-zinc-200 bg-[#141416]' 
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              Excel Fields
            </button>
            <button
              onClick={() => setActiveLeftTab('layers')}
              className={`flex-1 py-2.5 text-[10px] uppercase font-bold tracking-wider transition-all ${
                activeLeftTab === 'layers' 
                  ? 'text-zinc-200 bg-[#141416]' 
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              Layers ({canvasObjects.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {activeLeftTab === 'variables' ? (
              <div className="space-y-2">
                {cardFields.length > 0 ? (
                  cardFields.map((field) => {
                    if (field === '{Photo}') {
                      return (
                        <button
                          key={field}
                          onClick={addPhotoPlaceholder}
                          className="w-full flex items-center justify-between p-3 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-xl text-xs font-bold text-zinc-300 transition-all text-left"
                        >
                          <span>Photo Frame</span>
                          <Plus className="w-4 h-4 text-emerald-400" />
                        </button>
                      );
                    }
                    return (
                      <button
                        key={field}
                        onClick={() => addTextVariable(field)}
                        className="w-full flex items-center justify-between p-3 bg-dark-850 hover:bg-zinc-800 rounded-xl text-xs font-bold text-zinc-300 transition-all text-left"
                      >
                        <span className="truncate">{field}</span>
                        <Plus className="w-4 h-4 text-primary-450" />
                      </button>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-zinc-655 text-[10px]">
                    No variables. Load an Excel file.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {canvasObjects.length > 0 ? (
                  canvasObjects.map((obj, idx) => {
                    const isSelected = selectedObj === obj;
                    const isLocked = obj.lockMovementX;
                    let label = obj.type || 'Object';
                    if ((obj as any).name) label = (obj as any).name;
                    else if (obj.type === 'textbox' || obj.type === 'i-text') label = `T: ${(obj as any).text?.substring(0, 15)}`;

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          const canvas = fabricCanvasRef.current;
                          if (canvas) { canvas.setActiveObject(obj); canvas.renderAll(); }
                        }}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-primary-500/15 text-primary-300 font-bold'
                            : 'bg-dark-850/40 text-zinc-450 hover:bg-dark-800 hover:text-zinc-250'
                        }`}
                      >
                        <span className="truncate max-w-[130px]">{label}</span>
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => toggleLayerLock(obj)}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-550 hover:text-zinc-200"
                            title={isLocked ? "Unlock" : "Lock"}
                          >
                            {isLocked ? <Lock className="w-3.5 h-3.5 text-rose-500" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => moveLayer(obj, 'up')}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-550 hover:text-zinc-200"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveLayer(obj, 'down')}
                            className="p-1 hover:bg-zinc-800 rounded text-zinc-550 hover:text-zinc-200"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-zinc-655 text-[10px]">
                    No layers on canvas.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CENTER CANVASES WORKSPACE: Features Checkered Photoshop-like pasteboard grid */}
        <div className="flex-1 bg-[#121214] flex flex-col relative items-center justify-center p-8 overflow-hidden">
          
          {/* PHOTOSHOP FLOATING LEFT TOOLBAR */}
          <div className="absolute left-4 top-4 bg-[#141416]/95 flex flex-col items-center p-1.5 gap-2.5 rounded-xl shadow-2xl backdrop-blur-md z-20">
            <button 
              onClick={() => setSelectedTool('select')}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${selectedTool === 'select' ? 'bg-primary-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
              title="Move & Select Tool (V)"
            >
              <MousePointer className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => setSelectedTool('text')}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${selectedTool === 'text' ? 'bg-primary-500 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
              title="Type Text Tool (T)"
            >
              <TextIcon className="w-4.5 h-4.5" />
            </button>
            <div className="w-6 h-px bg-zinc-800 my-0.5"></div>
            <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" id="left-bg-upload" />
            <label 
              htmlFor="left-bg-upload"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer transition-all"
              title="Upload Backdrop Image"
            >
              <Upload className="w-4.5 h-4.5" />
            </label>
          </div>
          
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div 
            className="relative shadow-2xl bg-zinc-900 overflow-hidden rounded-xl transition-all [background-image:linear-gradient(45deg,#212124_25%,transparent_25%),linear-gradient(-45deg,#212124_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#212124_75%),linear-gradient(-45deg,transparent_75%,#212124_75%)] [background-size:20px_20px] [background-position:0_0,0_10px,10px_-10px,-10px_0px]"
            style={{ 
              width: cardW * displayScale * zoom, 
              height: cardH * displayScale * zoom 
            }}
          >
            <div 
              style={{ 
                width: cardW, 
                height: cardH, 
                transform: `scale(${displayScale * zoom})`, 
                transformOrigin: 'top left' 
              }}
            >
              <canvas ref={canvasRef} />
            </div>
          </div>

          {/* Floating Zoom & Status Bar */}
          <div className="absolute bottom-4 flex items-center gap-1.5 bg-[#141416]/95 p-1.5 rounded-xl shadow-2xl backdrop-blur-md z-10 text-[10px] text-zinc-400">
            <button onClick={() => setZoom(prev => Math.max(0.2, Number((prev - 0.1).toFixed(1))))} className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono font-bold w-12 text-center text-zinc-200">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(prev => Math.min(3, Number((prev + 0.1).toFixed(1))))} className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-zinc-850 mx-1"></div>
            <button onClick={() => setZoom(1)} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition-all">100%</button>
            <button onClick={() => setZoom(0.85)} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold transition-all">Fit</button>
          </div>
        </div>

        {/* PHOTOSHOP RIGHT PROPERTY PANEL: Character & Paragraph */}
        <div className="w-72 bg-[#141416] flex flex-col overflow-y-auto shrink-0 p-4 space-y-4 shadow-xl">
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/40">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-450">Properties Inspector</span>
            <Settings className="w-3.5 h-3.5 text-zinc-550" />
          </div>

          {selectedObj ? (
            <div className="space-y-4 text-xs">
              {/* Properties Geometry block */}
              <div className="bg-dark-900/40 rounded-xl p-3.5 space-y-2.5">
                <span className="text-[9px] font-black text-zinc-500 uppercase block mb-1">Transform</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] text-zinc-550 block mb-0.5">X Position</label>
                    <input type="number" value={selectedLeft} onChange={(e) => modifyPosition('left', Number(e.target.value))} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-200" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-555 block mb-0.5">Y Position</label>
                    <input type="number" value={selectedTop} onChange={(e) => modifyPosition('top', Number(e.target.value))} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-200" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-555 block mb-0.5">Width</label>
                    <input type="number" value={selectedWidth} onChange={(e) => modifyPosition('width', Number(e.target.value))} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-200" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-555 block mb-0.5">Height</label>
                    <input type="number" value={selectedHeight} onChange={(e) => modifyPosition('height', Number(e.target.value))} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-200" />
                  </div>
                  <div>
                    <label className="text-[9px] text-zinc-555 block mb-0.5">Rotation (Â°)</label>
                    <input 
                      type="number" 
                      value={rotation} 
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRotation(val);
                        if (selectedObj) {
                          selectedObj.set('angle', val);
                          selectedObj.setCoords();
                          fabricCanvasRef.current?.renderAll();
                          saveToHistory();
                          triggerAutoSave();
                        }
                      }} 
                      className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-200" 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-dark-900/40 rounded-xl p-3.5 space-y-2.5">
                <span className="text-[9px] font-black text-zinc-500 uppercase block">Appearance</span>
                <div>
                  <div className="mb-1 flex items-center justify-between"><label className="text-[9px] text-zinc-550">Opacity</label><span className="text-[10px] font-mono text-zinc-300">{opacity}%</span></div>
                  <input type="range" min="0" max="100" value={opacity} onChange={(e) => modifyOpacity(Number(e.target.value))} className="w-full accent-sky-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => toggleFlip('x')} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold transition-colors ${selectedObj.flipX ? 'bg-primary-500 text-white' : 'bg-dark-800 text-zinc-400 hover:text-zinc-200'}`}><FlipHorizontal className="h-3.5 w-3.5" /> Flip horizontal</button>
                  <button onClick={() => toggleFlip('y')} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold transition-colors ${selectedObj.flipY ? 'bg-primary-500 text-white' : 'bg-dark-800 text-zinc-400 hover:text-zinc-200'}`}><FlipVertical className="h-3.5 w-3.5" /> Flip vertical</button>
                </div>
              </div>

              {/* Alignments Panel */}
              <div className="bg-dark-900/40 rounded-xl p-3.5 space-y-2.5">
                <span className="text-[9px] font-black text-zinc-500 uppercase block mb-1">Align Layout</span>
                <div className="grid grid-cols-6 gap-1">
                  <button onClick={() => alignToCanvas('left')} className="bg-dark-800 hover:bg-zinc-800 p-1.5 rounded-lg flex justify-center text-zinc-400 hover:text-zinc-200" title="Align Left">
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="4" y1="2" x2="4" y2="22"></line><rect x="8" y="5" width="12" height="6" rx="1"></rect></svg>
                  </button>
                  <button onClick={() => alignToCanvas('center')} className="bg-dark-800 hover:bg-zinc-800 p-1.5 rounded-lg flex justify-center text-zinc-400 hover:text-zinc-200" title="Center Horizontally">
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"></line><rect x="6" y="5" width="12" height="5" rx="1"></rect></svg>
                  </button>
                  <button onClick={() => alignToCanvas('right')} className="bg-dark-800 hover:bg-zinc-800 p-1.5 rounded-lg flex justify-center text-zinc-400 hover:text-zinc-200" title="Align Right">
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="20" y1="2" x2="20" y2="22"></line><rect x="4" y="5" width="12" height="6" rx="1"></rect></svg>
                  </button>
                  <button onClick={() => alignToCanvas('top')} className="bg-dark-800 hover:bg-zinc-800 p-1.5 rounded-lg flex justify-center text-zinc-400 hover:text-zinc-200" title="Align Top">
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="4" x2="22" y2="4"></line><rect x="5" y="8" width="6" height="12" rx="1"></rect></svg>
                  </button>
                  <button onClick={() => alignToCanvas('middle')} className="bg-dark-800 hover:bg-zinc-800 p-1.5 rounded-lg flex justify-center text-zinc-400 hover:text-zinc-200" title="Center Vertically">
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"></line><rect x="5" y="6" width="6" height="12" rx="1"></rect></svg>
                  </button>
                  <button onClick={() => alignToCanvas('bottom')} className="bg-dark-800 hover:bg-zinc-800 p-1.5 rounded-lg flex justify-center text-zinc-400 hover:text-zinc-200" title="Align Bottom">
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="20" x2="22" y2="20"></line><rect x="5" y="4" width="6" height="12" rx="1"></rect></svg>
                  </button>
                </div>
              </div>

              {/* Photoshop character formatting */}
              {(selectedObj.type === 'textbox' || selectedObj.type === 'i-text' || selectedObj instanceof fabric.Textbox) && (
                <div className="bg-dark-900/40 rounded-xl p-3.5 space-y-3">
                  <span className="text-[9px] font-black text-zinc-500 uppercase block mb-1">Character & Paragraph</span>
                  
                  <div>
                    <label className="text-[9px] text-zinc-500 block mb-0.5">Text Value</label>
                    <textarea value={textContent} onChange={(e) => modifyTextContent(e.target.value)} rows={2} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none font-mono resize-none text-zinc-200" />
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-500 block mb-0.5">Font Family</label>
                    <select value={fontFamily} onChange={(e) => modifyFontFamily(e.target.value)} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-200 font-bold">
                      <option value="Outfit">Outfit</option>
                      <option value="Arial">Arial</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Courier New">Courier New</option>
                      {systemFonts.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] text-zinc-555 block mb-0.5">Font Size (pt)</label>
                      <input type="number" value={fontSize} onChange={(e) => modifyFontSize(Number(e.target.value))} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-250" />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-555 block mb-0.5">Styles</label>
                      <div className="flex gap-0.5 bg-dark-800 p-0.5 rounded-lg h-[32px] items-center">
                        <button onClick={modifyWeight} className={`flex-1 h-full rounded-md text-[10px] font-extrabold ${fontWeight === 'bold' ? 'bg-primary-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`} title="Bold"><Bold className="w-3.5 h-3.5 mx-auto" /></button>
                        <button onClick={modifyFontStyle} className={`flex-1 h-full rounded-md text-[10px] italic ${fontStyle === 'italic' ? 'bg-primary-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`} title="Italic"><Italic className="w-3.5 h-3.5 mx-auto" /></button>
                        <button onClick={modifyUnderline} className={`flex-1 h-full rounded-md text-[10px] underline ${underline ? 'bg-primary-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`} title="Underline"><Underline className="w-3.5 h-3.5 mx-auto" /></button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] text-zinc-555 block mb-0.5">Line Spacing</label>
                      <input type="number" step={0.05} value={lineHeight} onChange={(e) => { (selectedObj as fabric.Textbox).set('lineHeight', Number(e.target.value)); setLineHeight(Number(e.target.value)); fabricCanvasRef.current?.renderAll(); saveToHistory(); triggerAutoSave(); }} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-250" />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-555 block mb-0.5">Char Spacing</label>
                      <input type="number" step={1} value={charSpacing} onChange={(e) => { (selectedObj as fabric.Textbox).set('charSpacing', Number(e.target.value)); setCharSpacing(Number(e.target.value)); fabricCanvasRef.current?.renderAll(); saveToHistory(); triggerAutoSave(); }} className="w-full bg-dark-800 border-none rounded-lg px-2.5 py-1.5 focus:outline-none text-zinc-250" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] text-zinc-555 block mb-0.5">Text Color</label>
                      <div className="flex items-center bg-dark-800 rounded-lg p-0.5">
                        <input type="color" value={textColor} onChange={(e) => modifyColor(e.target.value)} className="w-6 h-6 rounded-md cursor-pointer bg-transparent border-none shrink-0" />
                        <input type="text" value={textColor} onChange={(e) => modifyColor(e.target.value)} className="w-full bg-transparent border-none text-[10px] focus:outline-none font-mono px-1.5 text-zinc-200 shrink" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-555 block mb-0.5">Alignment</label>
                      <div className="flex gap-0.5 bg-dark-800 p-0.5 rounded-lg h-[32px]">
                        <button onClick={() => modifyAlign('left')} className="flex-1 hover:bg-zinc-700 rounded-md flex items-center justify-center text-zinc-400"><AlignLeft className="w-3.5 h-3.5" /></button>
                        <button onClick={() => modifyAlign('center')} className="flex-1 hover:bg-zinc-700 rounded-md flex items-center justify-center text-zinc-400"><AlignCenter className="w-3.5 h-3.5" /></button>
                        <button onClick={() => modifyAlign('right')} className="flex-1 hover:bg-zinc-700 rounded-md flex items-center justify-center text-zinc-400"><AlignRight className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(selectedObj as any).name === '{Photo}' && (
                <div className="bg-dark-900/40 rounded-xl p-3.5 space-y-3">
                  <div><span className="text-[9px] font-black text-zinc-500 uppercase">Photo frame</span><p className="mt-1 text-[10px] leading-relaxed text-zinc-600">Photos use centered cover cropping, so portraits always fill the frame.</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => updatePhotoFrame({ shape: 'rect' })} className={`rounded-lg py-2 text-[10px] font-bold transition-colors ${photoShape === 'rect' ? 'bg-primary-500 text-white' : 'bg-dark-800 text-zinc-400 hover:text-zinc-200'}`}>Rectangle</button>
                    <button onClick={() => updatePhotoFrame({ shape: 'circle' })} className={`rounded-lg py-2 text-[10px] font-bold transition-colors ${photoShape === 'circle' ? 'bg-primary-500 text-white' : 'bg-dark-800 text-zinc-400 hover:text-zinc-200'}`}>Circle</button>
                  </div>
                  {photoShape === 'rect' && <div className="space-y-1.5"><div className="flex items-center justify-between"><label className="text-[9px] text-zinc-550">Corner radius</label><input type="number" min="0" max="300" value={photoRx} onChange={(e) => updatePhotoFrame({ radius: Number(e.target.value) })} className="w-16 rounded-md border-none bg-dark-800 px-2 py-1 text-right text-[10px] font-mono text-zinc-200 focus:outline-none" aria-label="Photo frame corner radius in pixels" /></div><input type="range" min="0" max="120" value={Math.min(photoRx, 120)} onChange={(e) => updatePhotoFrame({ radius: Number(e.target.value) })} className="w-full accent-sky-500" /><p className="text-[9px] text-zinc-600">0 px is square; higher values create softer corners.</p></div>}
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="mb-1 block text-[9px] text-zinc-550">Frame color</label><input type="color" value={photoStroke} onChange={(e) => updatePhotoFrame({ stroke: e.target.value })} className="h-8 w-full cursor-pointer rounded-lg border-0 bg-dark-800 p-1" /></div>
                    <div><label className="mb-1 block text-[9px] text-zinc-550">Border width</label><input type="number" min="0" max="30" value={photoStrokeWidth} onChange={(e) => updatePhotoFrame({ strokeWidth: Number(e.target.value) })} className="w-full rounded-lg border-none bg-dark-800 px-2.5 py-1.5 text-zinc-200 focus:outline-none" /></div>
                  </div>
                </div>
              )}

              {/* General shapes formatting */}
              {['rect', 'circle', 'line'].includes(selectedObj.type) && (
                <div className="bg-dark-900/40 rounded-xl p-3.5 space-y-2.5">
                  <span className="text-[9px] font-black text-zinc-500 uppercase block mb-1">Fill & Stroke</span>
                  <div>
                    <label className="text-[9px] text-zinc-500 block mb-0.5">Color Fill</label>
                    <div className="flex items-center bg-dark-800 rounded-lg p-0.5">
                      <input type="color" value={selectedObj.fill as string || '#ffffff'} onChange={(e) => modifyColor(e.target.value)} className="w-6 h-6 rounded-md cursor-pointer bg-transparent border-none shrink-0" />
                      <input type="text" value={selectedObj.fill as string || ''} onChange={(e) => modifyColor(e.target.value)} className="w-full bg-transparent border-none text-[10px] focus:outline-none font-mono px-1.5 text-zinc-200 shrink" />
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={deleteSelected}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors font-bold uppercase text-[10px] tracking-wider"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Element
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-center py-10 px-4">
              <Layers className="w-10 h-10 mb-3 opacity-30 text-primary-500 stroke-[1.2]" />
              <p className="text-[11px] leading-relaxed font-semibold">Select an object on the canvas layer tree to adjust coordinates, character properties, alignment, color and options.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
