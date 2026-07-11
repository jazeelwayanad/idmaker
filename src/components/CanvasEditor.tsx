import React, { useEffect, useRef, useState } from 'react';
import { useStore, Template } from '../hooks/useStore';
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
  Square, Type, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Trash2, RotateCw, Copy, Layers, Save, Undo, Redo, Columns, CheckSquare, Upload,
  Settings, Maximize
} from 'lucide-react';

// Preset card sizes in mm
const CARD_PRESETS: Record<string, { w: number; h: number; label: string }> = {
  'cr80': { w: 85.6, h: 53.98, label: 'CR-80 Standard (85.6 × 54 mm)' },
  'cr79': { w: 83.9, h: 51.0, label: 'CR-79 (83.9 × 51 mm)' },
  'a7': { w: 74, h: 105, label: 'A7 (74 × 105 mm)' },
  'a6': { w: 105, h: 148, label: 'A6 (105 × 148 mm)' },
  'custom': { w: 85.6, h: 53.98, label: 'Custom Size' },
};

const DPI = 300;
const MM_TO_PX = DPI / 25.4; // 1 mm = 11.811 px at 300 DPI

export default function CanvasEditor() {
  const { activeProject, activeTemplate, saveTemplate, cardFields } = useStore();
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  
  const [activeSideIndex, setActiveSideIndex] = useState<number>(0);
  const [selectedObj, setSelectedObj] = useState<fabric.FabricObject | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSetup, setShowSetup] = useState(true);

  // Card size settings
  const [cardPreset, setCardPreset] = useState('cr80');
  const [cardWidthMM, setCardWidthMM] = useState(85.6);
  const [cardHeightMM, setCardHeightMM] = useState(53.98);

  // Sides mode settings
  const [sidesMode, setSidesMode] = useState<'1' | '2' | 'custom'>('2');
  const [sidesCount, setSidesCount] = useState<number>(2);

  // Element styles states
  const [fontFamily, setFontFamily] = useState('Outfit');
  const [fontSize, setFontSize] = useState(16);
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
  const [textPlacementMode, setTextPlacementMode] = useState<string | null>(null);

  // Image placeholder custom states
  const [photoShape, setPhotoShape] = useState<'rect' | 'circle'>('rect');
  const [photoRx, setPhotoRx] = useState(8);
  const [photoRy, setPhotoRy] = useState(8);
  const [photoStroke, setPhotoStroke] = useState('#0284c7');
  const [photoStrokeWidth, setPhotoStrokeWidth] = useState(2);
  const [photoFill, setPhotoFill] = useState('#2a2a35');
  const [photoWidth, setPhotoWidth] = useState(250);
  const [photoHeight, setPhotoHeight] = useState(320);
  const [photoX, setPhotoX] = useState(380);
  const [photoY, setPhotoY] = useState(150);

  // Compute pixel dimensions
  const cardW = Math.round(cardWidthMM * MM_TO_PX);
  const cardH = Math.round(cardHeightMM * MM_TO_PX);

  // Screen display scale factor - fit into ~550px max width
  const displayScale = Math.min(550 / cardW, 400 / cardH, 0.6);

  // Helper to extract designs array
  const getDesignsArray = (template: Template | null): string[] => {
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

  // Load system fonts on component mount
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

  // Update canvas zoom and dimensions dynamically
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.setZoom(zoom);
    canvas.setDimensions({
      width: cardW * displayScale * zoom,
      height: cardH * displayScale * zoom
    });
    canvas.renderAll();
  }, [zoom, cardW, cardH, displayScale]);

  // Handle point vs paragraph text placement mouse events
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (textPlacementMode) {
      canvas.defaultCursor = 'text';
      canvas.hoverCursor = 'text';
      canvas.selection = false;
    } else {
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      canvas.selection = true;
      return;
    }

    let isMouseDown = false;
    let startX = 0;
    let startY = 0;
    let rectPreview: fabric.Rect | null = null;

    const onMouseDown = (opt: any) => {
      canvas.discardActiveObject();
      const pointer = canvas.getScenePoint(opt.e);
      isMouseDown = true;
      startX = pointer.x;
      startY = pointer.y;

      rectPreview = new fabric.Rect({
        left: startX,
        top: startY,
        width: 0,
        height: 0,
        fill: 'transparent',
        stroke: '#0284c7',
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false
      });
      canvas.add(rectPreview);
      canvas.renderAll();
    };

    const onMouseMove = (opt: any) => {
      if (!isMouseDown || !rectPreview) return;
      const pointer = canvas.getScenePoint(opt.e);
      
      const width = pointer.x - startX;
      const height = pointer.y - startY;

      rectPreview.set({
        width: Math.abs(width),
        height: Math.abs(height),
        left: width > 0 ? startX : pointer.x,
        top: height > 0 ? startY : pointer.y
      });
      canvas.renderAll();
    };

    const onMouseUp = (opt: any) => {
      if (!isMouseDown) return;
      isMouseDown = false;
      const pointer = canvas.getScenePoint(opt.e);

      if (rectPreview) {
        canvas.remove(rectPreview);
        rectPreview = null;
      }

      const endX = pointer.x;
      const endY = pointer.y;
      const width = Math.abs(endX - startX);
      
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);

      let textObject;

      // If drag width is small (< 15px), place Point Text (fabric.IText)
      if (width < 15) {
        textObject = new fabric.IText(textPlacementMode, {
          left: x,
          top: y,
          fontSize: 28 * displayScale,
          fontFamily: 'Outfit',
          fill: '#ffffff',
          fontWeight: 'normal',
          textAlign: 'center',
          borderColor: '#0284c7',
          cornerColor: '#0284c7',
          cornerSize: 8,
          transparentCorners: false
        });
      } else {
        // If dragged, place Paragraph Text (fabric.Textbox)
        textObject = new fabric.Textbox(textPlacementMode, {
          left: x,
          top: y,
          width: width,
          fontSize: 28 * displayScale,
          fontFamily: 'Outfit',
          fill: '#ffffff',
          fontWeight: 'normal',
          textAlign: 'center',
          borderColor: '#0284c7',
          cornerColor: '#0284c7',
          cornerSize: 8,
          transparentCorners: false
        });
      }

      canvas.add(textObject);
      canvas.setActiveObject(textObject);
      
      // Exit text placement mode
      setTextPlacementMode(null);
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      canvas.selection = true;

      canvas.renderAll();
      saveToHistory();
      triggerAutoSave();
    };

    canvas.on('mouse:down', onMouseDown);
    canvas.on('mouse:move', onMouseMove);
    canvas.on('mouse:up', onMouseUp);

    return () => {
      canvas.off('mouse:down', onMouseDown);
      canvas.off('mouse:move', onMouseMove);
      canvas.off('mouse:up', onMouseUp);
    };
  }, [textPlacementMode, displayScale]);

  // Load saved template dimensions and sides config
  useEffect(() => {
    if (activeTemplate) {
      if (activeTemplate.width && activeTemplate.height) {
        setCardWidthMM(activeTemplate.width);
        setCardHeightMM(activeTemplate.height);
        
        // Match preset
        const matchedPreset = Object.entries(CARD_PRESETS).find(
          ([k, v]) => k !== 'custom' && Math.abs(v.w - activeTemplate.width) < 0.5 && Math.abs(v.h - activeTemplate.height) < 0.5
        );
        setCardPreset(matchedPreset ? matchedPreset[0] : 'custom');

        // Match sides count
        let count = 2;
        let mode: '1' | '2' | 'custom' = '2';
        let isConfigured = false;
        if (activeTemplate.layout) {
          try {
            const layoutData = JSON.parse(activeTemplate.layout);
            if (layoutData.isConfigured) {
              isConfigured = true;
            }
            if (layoutData.sidesCount) {
              count = Number(layoutData.sidesCount);
              if (count === 1) mode = '1';
              else if (count === 2) mode = '2';
              else mode = 'custom';
            }
          } catch (e) {}
        }
        setSidesMode(mode);
        setSidesCount(count);
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

  const handleSidesModeChange = (mode: '1' | '2' | 'custom') => {
    setSidesMode(mode);
    if (mode === '1') setSidesCount(1);
    else if (mode === '2') setSidesCount(2);
  };

  const handleApplySize = async () => {
    const activeLayout = activeTemplate?.layout ? JSON.parse(activeTemplate.layout) : {};
    activeLayout.sidesCount = sidesCount;
    activeLayout.isConfigured = true;

    await saveTemplate({ 
      width: cardWidthMM, 
      height: cardHeightMM, 
      unit: 'mm',
      layout: JSON.stringify(activeLayout)
    });
    setShowSetup(false);
  };

  useEffect(() => {
    if (showSetup || !canvasRef.current) return;

    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: cardW * displayScale,
      height: cardH * displayScale,
      backgroundColor: '#1e1e24',
      selection: true,
    });

    fabricCanvasRef.current = canvas;

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
      saveToHistory();
      triggerAutoSave();
    });
    canvas.on('object:moving', (e) => {
      if (e.target) updateStyleControls(e.target);
    });
    canvas.on('object:scaling', (e) => {
      if (e.target) updateStyleControls(e.target);
    });

    loadSideData(activeSideIndex);

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [activeTemplate?.id, activeSideIndex, showSetup, cardW, cardH]);

  const loadSideData = (sideIdx: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTemplate) return;
    canvas.clear();
    canvas.backgroundColor = '#1e1e24';
    
    const designs = getDesignsArray(activeTemplate);
    const designJson = designs[sideIdx];
    
    if (designJson && designJson !== '{}') {
      try {
        const parsed = JSON.parse(designJson);
        canvas.loadFromJSON(parsed).then(() => {
          canvas.renderAll();
          saveToHistory(true);
        });
      } catch (err) {
        console.error('Failed to load fabric JSON:', err);
      }
    } else {
      canvas.renderAll();
      saveToHistory(true);
    }
  };

  const updateStyleControls = (obj: fabric.FabricObject) => {
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const textObj = obj as fabric.Textbox;
      setFontFamily(textObj.fontFamily || 'Outfit');
      setFontSize(Math.round((textObj.fontSize || 16) / displayScale));
      setTextColor(textObj.fill as string || '#ffffff');
      setFontWeight(String(textObj.fontWeight || 'normal'));
      setFontStyle(textObj.fontStyle || 'normal');
      setUnderline(!!textObj.underline);
      setLinethrough(!!textObj.linethrough);
      setTextBackgroundColor(textObj.textBackgroundColor || 'transparent');
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
      setPhotoWidth(Math.round((obj.width * obj.scaleX!) / displayScale));
      setPhotoHeight(Math.round((obj.height * obj.scaleY!) / displayScale));
      setPhotoX(Math.round(obj.left / displayScale));
      setPhotoY(Math.round(obj.top / displayScale));
    }
  };

  const saveToHistory = (clear = false) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const json = JSON.stringify((canvas as any).toJSON(['name', 'photoShape', 'photoRx', 'photoRy', 'photoStroke', 'photoStrokeWidth', 'photoFill']));
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
    const prevIndex = historyIndex - 1;
    setHistoryIndex(prevIndex);
    canvas.loadFromJSON(JSON.parse(history[prevIndex])).then(() => canvas.renderAll());
  };

  const handleRedo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    canvas.loadFromJSON(JSON.parse(history[nextIndex])).then(() => canvas.renderAll());
  };

  // Add Elements
  const addTextPlaceholder = (placeholderText: string = '{Name}') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const text = new fabric.Textbox(placeholderText, {
      left: 100 * displayScale,
      top: 150 * displayScale,
      width: 400 * displayScale,
      fontSize: 28 * displayScale,
      fontFamily: 'Outfit',
      fill: '#ffffff',
      fontWeight: 'normal',
      textAlign: 'center',
      borderColor: '#0284c7',
      cornerColor: '#0284c7',
      cornerSize: 8,
      transparentCorners: false
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    saveToHistory();
    triggerAutoSave();
  };

  const addPhotoPlaceholder = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const rect = new fabric.Rect({
      left: 380 * displayScale,
      top: 150 * displayScale,
      width: 250 * displayScale,
      height: 320 * displayScale,
      fill: '#2a2a35',
      stroke: '#0284c7',
      strokeWidth: 2,
      rx: 8, ry: 8,
      name: '{Photo}',
      borderColor: '#0284c7', cornerColor: '#0284c7'
    } as any);
    const label = new fabric.Textbox('{Photo}', {
      left: 385 * displayScale,
      top: 290 * displayScale,
      width: 240 * displayScale,
      fontSize: 20 * displayScale,
      fontFamily: 'Outfit',
      fill: '#8c8c9e',
      textAlign: 'center',
      selectable: false
    });
    const group = new fabric.Group([rect, label], {
      left: 380 * displayScale, top: 150 * displayScale,
      name: '{Photo}', borderColor: '#0284c7', cornerColor: '#0284c7', transparentCorners: false
    } as any);
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
    saveToHistory();
    triggerAutoSave();
  };


  // Upload Custom Background Image
  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const canvas = fabricCanvasRef.current;
    if (!file || !canvas) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      fabric.Image.fromURL(imgUrl).then((img) => {
        img.set({
          left: 0, top: 0,
          scaleX: (cardW * displayScale) / img.width!,
          scaleY: (cardH * displayScale) / img.height!,
          selectable: false, evented: false
        });
        canvas.backgroundImage = img;
        canvas.renderAll();
        saveToHistory();
        triggerAutoSave();
      });
    };
    reader.readAsDataURL(file);
  };

  // Properties Modifiers
  const modifyFontFamily = (family: string) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('fontFamily', family);
      setFontFamily(family);
      canvas.renderAll();
      if (document.fonts) {
        document.fonts.load(`12px "${family}"`).then(() => {
          canvas.renderAll();
          triggerAutoSave();
        }).catch((err) => {
          console.warn('Failed to load system font face:', err);
          triggerAutoSave();
        });
      } else {
        triggerAutoSave();
      }
      saveToHistory();
    }
  };

  const modifyFontSize = (size: number) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('fontSize', size * displayScale);
      setFontSize(size);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyColor = (color: string) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('fill', color);
      setTextColor(color);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyWeight = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const nextWeight = fontWeight === 'normal' ? 'bold' : 'normal';
      (obj as fabric.Textbox).set('fontWeight', nextWeight);
      setFontWeight(nextWeight);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('textAlign', align);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyTextCase = (mode: 'uppercase' | 'lowercase' | 'titlecase' | 'normal') => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      let currentText = (obj as fabric.Textbox).text || '';
      if (mode === 'uppercase') {
        currentText = currentText.toUpperCase();
      } else if (mode === 'lowercase') {
        currentText = currentText.toLowerCase();
      } else if (mode === 'titlecase') {
        currentText = currentText.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      }
      (obj as fabric.Textbox).set('text', currentText);
      setTextContent(currentText);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const deleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    canvas.remove(obj);
    canvas.discardActiveObject();
    setSelectedObj(null);
    canvas.renderAll(); saveToHistory();
    triggerAutoSave();
  };

  const modifyTextContent = (text: string) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('text', text);
      setTextContent(text);
      canvas.renderAll();
      triggerAutoSave();
    }
  };

  const modifyFontStyle = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const nextStyle = fontStyle === 'normal' ? 'italic' : 'normal';
      (obj as fabric.Textbox).set('fontStyle', nextStyle);
      setFontStyle(nextStyle);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyUnderline = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const next = !underline;
      (obj as fabric.Textbox).set('underline', next);
      setUnderline(next);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyLinethrough = () => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      const next = !linethrough;
      (obj as fabric.Textbox).set('linethrough', next);
      setLinethrough(next);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyTextBackgroundColor = (color: string) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('textBackgroundColor', color);
      setTextBackgroundColor(color);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyLineHeight = (val: number) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('lineHeight', val);
      setLineHeight(val);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyCharSpacing = (val: number) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;
    if (obj instanceof fabric.Textbox || obj.type === 'textbox' || obj.type === 'i-text') {
      (obj as fabric.Textbox).set('charSpacing', val);
      setCharSpacing(val);
      canvas.renderAll(); saveToHistory();
      triggerAutoSave();
    }
  };

  const modifyPhotoProperty = (prop: string, val: any) => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj) return;

    const currentShape = prop === 'shape' ? val : (photoShape || 'rect');
    const currentRx = prop === 'rx' ? Number(val) : photoRx;
    const currentRy = prop === 'ry' ? Number(val) : photoRy;
    const currentStroke = prop === 'stroke' ? val : photoStroke;
    const currentStrokeWidth = prop === 'strokeWidth' ? Number(val) : photoStrokeWidth;
    const currentFill = prop === 'fill' ? val : photoFill;

    let currentW = photoWidth;
    let currentH = photoHeight;
    let currentX = photoX;
    let currentY = photoY;

    if (prop === 'width') currentW = Number(val);
    if (prop === 'height') currentH = Number(val);
    if (prop === 'x') currentX = Number(val);
    if (prop === 'y') currentY = Number(val);

    if (prop === 'shape') setPhotoShape(val);
    if (prop === 'rx') setPhotoRx(Number(val));
    if (prop === 'ry') setPhotoRy(Number(val));
    if (prop === 'stroke') setPhotoStroke(val);
    if (prop === 'strokeWidth') setPhotoStrokeWidth(Number(val));
    if (prop === 'fill') setPhotoFill(val);
    if (prop === 'width') setPhotoWidth(Number(val));
    if (prop === 'height') setPhotoHeight(Number(val));
    if (prop === 'x') setPhotoX(Number(val));
    if (prop === 'y') setPhotoY(Number(val));

    canvas.remove(obj);

    const wPx = currentW * displayScale;
    const hPx = currentH * displayScale;
    const xPx = currentX * displayScale;
    const yPx = currentY * displayScale;

    let bgObj;
    if (currentShape === 'circle') {
      const radius = Math.min(wPx, hPx) / 2;
      bgObj = new fabric.Circle({
        left: 0,
        top: 0,
        radius: radius,
        fill: currentFill,
        stroke: currentStroke,
        strokeWidth: currentStrokeWidth,
        name: 'bg'
      });
    } else {
      bgObj = new fabric.Rect({
        left: 0,
        top: 0,
        width: wPx,
        height: hPx,
        rx: currentRx,
        ry: currentRy,
        fill: currentFill,
        stroke: currentStroke,
        strokeWidth: currentStrokeWidth,
        name: 'bg'
      });
    }

    const label = new fabric.Textbox('{Photo}', {
      left: 5,
      top: (currentShape === 'circle' ? (Math.min(wPx, hPx) / 2 - 10) : (hPx / 2 - 10)),
      width: (currentShape === 'circle' ? Math.min(wPx, hPx) - 10 : wPx - 10),
      fontSize: 20 * displayScale,
      fontFamily: 'Outfit',
      fill: '#8c8c9e',
      textAlign: 'center',
      selectable: false
    });

    const group = new fabric.Group([bgObj, label], {
      left: xPx,
      top: yPx,
      name: '{Photo}',
      borderColor: '#0284c7',
      cornerColor: '#0284c7',
      transparentCorners: false
    } as any);

    (group as any).photoShape = currentShape;
    (group as any).photoRx = currentRx;
    (group as any).photoRy = currentRy;
    (group as any).photoStroke = currentStroke;
    (group as any).photoStrokeWidth = currentStrokeWidth;
    (group as any).photoFill = currentFill;

    canvas.add(group);
    canvas.setActiveObject(group);
    setSelectedObj(group);
    canvas.renderAll();
    saveToHistory();
    triggerAutoSave();
  };

  const alignToCanvas = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const canvas = fabricCanvasRef.current;
    const obj = selectedObj;
    if (!canvas || !obj || obj.type === 'activeSelection') return;

    const width = obj.width * obj.scaleX!;
    const height = obj.height * obj.scaleY!;
    const canvasW = cardW * displayScale;
    const canvasH = cardH * displayScale;

    if (alignment === 'left') {
      obj.set('left', 0);
    } else if (alignment === 'center') {
      obj.set('left', (canvasW - width) / 2);
    } else if (alignment === 'right') {
      obj.set('left', canvasW - width);
    } else if (alignment === 'top') {
      obj.set('top', 0);
    } else if (alignment === 'middle') {
      obj.set('top', (canvasH - height) / 2);
    } else if (alignment === 'bottom') {
      obj.set('top', canvasH - height);
    }

    obj.setCoords();
    canvas.renderAll();
    saveToHistory();
    triggerAutoSave();
    updateStyleControls(obj);
  };

  const alignSelectedObjects = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (!activeObject || activeObject.type !== 'activeSelection') return;

    const objects = (activeObject as any).getObjects() as fabric.FabricObject[];
    const selWidth = activeObject.width!;
    const selHeight = activeObject.height!;

    objects.forEach((obj) => {
      const objWidth = obj.width! * obj.scaleX!;
      const objHeight = obj.height! * obj.scaleY!;

      if (alignment === 'left') {
        obj.set('left', -selWidth / 2 + objWidth / 2);
      } else if (alignment === 'center') {
        obj.set('left', 0);
      } else if (alignment === 'right') {
        obj.set('left', selWidth / 2 - objWidth / 2);
      } else if (alignment === 'top') {
        obj.set('top', -selHeight / 2 + objHeight / 2);
      } else if (alignment === 'middle') {
        obj.set('top', 0);
      } else if (alignment === 'bottom') {
        obj.set('top', selHeight / 2 - objHeight / 2);
      }
    });

    activeObject.setCoords();
    canvas.renderAll();
    saveToHistory();
    triggerAutoSave();
  };

  const distributeSelectedObjects = (direction: 'horizontal' | 'vertical') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (!activeObject || activeObject.type !== 'activeSelection') return;

    const objects = [...(activeObject as any).getObjects()] as fabric.FabricObject[];
    if (objects.length < 3) return;

    if (direction === 'horizontal') {
      objects.sort((a, b) => a.left! - b.left!);
      const first = objects[0];
      const last = objects[objects.length - 1];
      const minLeft = first.left!;
      const maxLeft = last.left!;
      const totalSpacing = maxLeft - minLeft;
      const step = totalSpacing / (objects.length - 1);
      
      for (let i = 1; i < objects.length - 1; i++) {
        objects[i].set('left', minLeft + i * step);
      }
    } else {
      objects.sort((a, b) => a.top! - b.top!);
      const first = objects[0];
      const last = objects[objects.length - 1];
      const minTop = first.top!;
      const maxTop = last.top!;
      const totalSpacing = maxTop - minTop;
      const step = totalSpacing / (objects.length - 1);
      
      for (let i = 1; i < objects.length - 1; i++) {
        objects[i].set('top', minTop + i * step);
      }
    }

    activeObject.setCoords();
    canvas.renderAll();
    saveToHistory();
    triggerAutoSave();
  };

  const handleSave = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTemplate) return;
    const data = JSON.stringify((canvas as any).toJSON(['name', 'photoShape', 'photoRx', 'photoRy', 'photoStroke', 'photoStrokeWidth', 'photoFill']));
    const designs = getDesignsArray(activeTemplate);
    designs[activeSideIndex] = data;

    await saveTemplate({ 
      frontDesign: JSON.stringify(designs),
      backDesign: designs[1] || '{}'
    });
    alert(`Side ${activeSideIndex + 1} template design saved successfully!`);
  };

  const triggerAutoSave = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !activeTemplate) return;
    const data = JSON.stringify((canvas as any).toJSON(['name', 'photoShape', 'photoRx', 'photoRy', 'photoStroke', 'photoStrokeWidth', 'photoFill']));
    const designs = getDesignsArray(activeTemplate);
    designs[activeSideIndex] = data;

    saveTemplate({ 
      frontDesign: JSON.stringify(designs),
      backDesign: designs[1] || '{}'
    });
  };

  // ─── Setup Screen ───
  if (showSetup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-6">
        <div className="glass-panel p-8 rounded-2xl w-full max-w-lg space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-500/10 border border-primary-500/20 rounded-2xl mb-4">
              <Maximize className="w-7 h-7 text-primary-500" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Card Size & Setup</h2>
            <p className="text-zinc-400 text-sm mt-1">Configure dimensions and card sides before designing your template.</p>
          </div>

          {/* Preset Selector */}
          <div>
            <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Card Size Preset</label>
            <select
              value={cardPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full bg-dark-800 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 transition-colors"
            >
              {Object.entries(CARD_PRESETS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          {/* Custom Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Width (mm)</label>
              <input
                type="number"
                value={cardWidthMM}
                step={0.1}
                onChange={(e) => { setCardWidthMM(Number(e.target.value)); setCardPreset('custom'); }}
                className="w-full bg-dark-800 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Height (mm)</label>
              <input
                type="number"
                value={cardHeightMM}
                step={0.1}
                onChange={(e) => { setCardHeightMM(Number(e.target.value)); setCardPreset('custom'); }}
                className="w-full bg-dark-800 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Sides configuration */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Card Sides</label>
              <select
                value={sidesMode}
                onChange={(e) => handleSidesModeChange(e.target.value as '1' | '2' | 'custom')}
                className="w-full bg-dark-800 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 transition-colors"
              >
                <option value="1">Front Side Only (1 Side)</option>
                <option value="2">Double Sided (2 Sides)</option>
                <option value="custom">Custom Multi-Sides...</option>
              </select>
            </div>

            {sidesMode === 'custom' && (
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Number of Sides</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={sidesCount}
                  onChange={(e) => setSidesCount(Math.max(1, Math.min(10, Number(e.target.value))))}
                  className="w-full bg-dark-800 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
            )}
          </div>

          {/* Pixel Preview */}
          <div className="bg-dark-800/60 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-zinc-400 text-xs">At 300 DPI this card will be</p>
            <p className="text-zinc-100 font-bold text-lg mt-1">
              {Math.round(cardWidthMM * MM_TO_PX)} × {Math.round(cardHeightMM * MM_TO_PX)} px
            </p>
          </div>

          <button
            onClick={handleApplySize}
            className="w-full bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-primary-500/20 text-sm"
          >
            Continue to Designer →
          </button>
        </div>
      </div>
    );
  }

  // Generate tabs for designer
  const tabsList = Array.from({ length: sidesCount }).map((_, idx) => `Side ${idx + 1}`);

  // ─── Main Editor ───
  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[500px]">
      {/* Sidebar Toolbar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col gap-4 lg:w-64">
        {/* Card size quick info */}
        <button
          onClick={() => setShowSetup(true)}
          className="w-full flex items-center justify-between p-2.5 bg-dark-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs transition-all"
        >
          <span className="text-zinc-400 font-semibold">Card: {cardWidthMM} × {cardHeightMM} mm</span>
          <Settings className="w-3.5 h-3.5 text-zinc-500" />
        </button>

        <div>
          <h3 className="font-bold text-zinc-200 text-sm">Placeholders</h3>
          <p className="text-zinc-500 text-[10px]">Auto-generated from your Excel fields</p>
        </div>
        {cardFields.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
            {cardFields.map((field) => {
              if (field === '{Photo}') {
                return (
                  <button key={field} onClick={addPhotoPlaceholder} className="flex flex-col items-center justify-center gap-1.5 p-3 bg-dark-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-zinc-300 text-xs font-semibold hover:bg-zinc-800 transition-all">
                    <ImageIcon className="w-4.5 h-4.5 text-emerald-500" /><span>Photo</span>
                  </button>
                );
              }

              return (
                <button 
                  key={field} 
                  onClick={() => setTextPlacementMode(textPlacementMode === `{${field}}` ? null : `{${field}}`)} 
                  className={`flex flex-col items-center justify-center gap-1.5 p-3 border rounded-xl text-xs font-semibold transition-all ${
                    textPlacementMode === `{${field}}` 
                      ? 'bg-primary-500/20 border-primary-500 text-primary-400' 
                      : 'bg-dark-800 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Type className="w-4.5 h-4.5 text-primary-500" />
                  <span className="truncate max-w-full text-center">{field}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-dark-800/50 border border-zinc-800 rounded-xl p-4 text-center">
            <p className="text-zinc-500 text-xs leading-relaxed">No fields configured yet.<br/>Import an Excel file first and select which columns to show on the ID card.</p>
          </div>
        )}

        <div className="border-t border-zinc-800/80 pt-4">
          <h3 className="font-bold text-zinc-200 text-sm mb-2">Upload Background</h3>
          <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" id="bg-upload-input" />
          <label htmlFor="bg-upload-input" className="w-full bg-dark-800 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all text-xs">
            <Upload className="w-3.5 h-3.5" /> Background Image
          </label>
        </div>

        {/* History tools */}
        <div className="border-t border-zinc-800/80 pt-4 flex gap-2">
          <button onClick={handleUndo} disabled={historyIndex <= 0} className="flex-1 bg-dark-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 rounded-xl p-2 flex items-center justify-center" title="Undo">
            <Undo className="w-4 h-4 text-zinc-300" />
          </button>
          <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="flex-1 bg-dark-800 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 rounded-xl p-2 flex items-center justify-center" title="Redo">
            <Redo className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      </div>

      {/* Editor Center Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-dark-800/40 rounded-2xl border border-zinc-800/50">
        {/* Card Side Toggle Tabs */}
        <div className="flex flex-wrap gap-1 bg-dark-900 border border-zinc-800 p-1 rounded-xl mb-6 max-w-full overflow-x-auto">
          {tabsList.map((tabName, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSideIndex(idx)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeSideIndex === idx ? 'bg-primary-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {tabName}
            </button>
          ))}
        </div>

        <div className="relative border border-zinc-700/50 rounded-xl overflow-auto shadow-2xl bg-dark-900 max-w-full max-h-[500px] p-6 flex items-center justify-center">
          {textPlacementMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary-500 text-white px-4 py-2 rounded-full shadow-lg text-xs font-bold flex items-center gap-2 animate-bounce z-50">
              <Type className="w-4 h-4" />
              <span>Click once or drag on canvas to place {textPlacementMode}</span>
            </div>
          )}
          <div className="shrink-0">
            <canvas ref={canvasRef} />
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

        <p className="text-zinc-500 text-[10px] mt-4 uppercase tracking-wider font-semibold">
          Canvas: {cardW} × {cardH} px ({cardWidthMM} × {cardHeightMM} mm @ 300 DPI)
        </p>
      </div>

      {/* Sidebar Properties Panel */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col gap-4 lg:w-64">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-zinc-200 text-sm">Properties</h3>
          <button onClick={handleSave} className="bg-primary-500 hover:bg-primary-600 text-white p-1.5 rounded-lg transition-all" title="Save Template Data">
            <Save className="w-4 h-4" />
          </button>
        </div>

        {selectedObj ? (
          <div className="space-y-4">
            {/* Alignment Tools Card */}
            <div className="bg-dark-800/40 border border-zinc-800/80 rounded-xl p-3 space-y-2.5">
              <label className="text-[10px] text-zinc-500 font-bold uppercase block border-b border-zinc-800/50 pb-1.5">
                {selectedObj.type === 'activeSelection' ? 'Align & Distribute Selection' : 'Align to Canvas'}
              </label>
              
              <div className="grid grid-cols-6 gap-1">
                <button 
                  onClick={() => selectedObj.type === 'activeSelection' ? alignSelectedObjects('left') : alignToCanvas('left')} 
                  className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                  title="Align Left"
                >
                  <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="4" y1="2" x2="4" y2="22"></line><rect x="8" y="5" width="12" height="6" rx="1"></rect><rect x="8" y="14" width="8" height="5" rx="1"></rect></svg>
                </button>
                <button 
                  onClick={() => selectedObj.type === 'activeSelection' ? alignSelectedObjects('center') : alignToCanvas('center')} 
                  className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                  title="Align Horizontal Center"
                >
                  <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"></line><rect x="6" y="5" width="12" height="5" rx="1"></rect><rect x="8" y="14" width="8" height="5" rx="1"></rect></svg>
                </button>
                <button 
                  onClick={() => selectedObj.type === 'activeSelection' ? alignSelectedObjects('right') : alignToCanvas('right')} 
                  className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                  title="Align Right"
                >
                  <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="20" y1="2" x2="20" y2="22"></line><rect x="4" y="5" width="12" height="6" rx="1"></rect><rect x="8" y="14" width="8" height="5" rx="1"></rect></svg>
                </button>
                <button 
                  onClick={() => selectedObj.type === 'activeSelection' ? alignSelectedObjects('top') : alignToCanvas('top')} 
                  className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                  title="Align Top"
                >
                  <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="4" x2="22" y2="4"></line><rect x="5" y="8" width="6" height="12" rx="1"></rect><rect x="14" y="8" width="5" height="8" rx="1"></rect></svg>
                </button>
                <button 
                  onClick={() => selectedObj.type === 'activeSelection' ? alignSelectedObjects('middle') : alignToCanvas('middle')} 
                  className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                  title="Align Vertical Center"
                >
                  <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"></line><rect x="5" y="6" width="6" height="12" rx="1"></rect><rect x="14" y="8" width="5" height="8" rx="1"></rect></svg>
                </button>
                <button 
                  onClick={() => selectedObj.type === 'activeSelection' ? alignSelectedObjects('bottom') : alignToCanvas('bottom')} 
                  className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 p-1.5 rounded border border-zinc-700 flex justify-center items-center" 
                  title="Align Bottom"
                >
                  <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="20" x2="22" y2="20"></line><rect x="5" y="4" width="6" height="12" rx="1"></rect><rect x="14" y="10" width="5" height="8" rx="1"></rect></svg>
                </button>
              </div>

              {selectedObj.type === 'activeSelection' && (
                <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-zinc-800/40">
                  <button 
                    onClick={() => distributeSelectedObjects('horizontal')} 
                    className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 py-1.5 px-2 rounded border border-zinc-700 flex items-center justify-center gap-1.5 text-[10px] font-bold" 
                    title="Distribute Center Horizontally"
                  >
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="4" y1="2" x2="4" y2="22"></line><line x1="20" y1="2" x2="20" y2="22"></line><rect x="9" y="7" width="6" height="10" rx="1"></rect></svg>
                    Distribute H
                  </button>
                  <button 
                    onClick={() => distributeSelectedObjects('vertical')} 
                    className="bg-dark-800 hover:bg-zinc-800 text-zinc-300 py-1.5 px-2 rounded border border-zinc-700 flex items-center justify-center gap-1.5 text-[10px] font-bold" 
                    title="Distribute Center Vertically"
                  >
                    <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2"><line x1="2" y1="4" x2="22" y2="4"></line><line x1="20" y1="2" x2="20" y2="22"></line><rect x="7" y="9" width="10" height="6" rx="1"></rect></svg>
                    Distribute V
                  </button>
                </div>
              )}
            </div>

            {(selectedObj.type === 'textbox' || selectedObj.type === 'i-text' || selectedObj instanceof fabric.Textbox) && (
              <div className="space-y-4">
                {/* CHARACTER PANEL */}
                <div className="bg-dark-800/40 border border-zinc-800/80 rounded-xl p-3 space-y-3">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block border-b border-zinc-800/50 pb-1.5">
                    Character
                  </label>
                  
                  <div>
                    <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Text Content</label>
                    <textarea 
                      value={textContent} 
                      onChange={(e) => modifyTextContent(e.target.value)} 
                      rows={3}
                      className="w-full bg-dark-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none text-zinc-200 resize-none font-sans" 
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Font Family</label>
                    <select value={fontFamily} onChange={(e) => modifyFontFamily(e.target.value)} className="w-full bg-dark-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none max-h-40 text-zinc-200">
                      <option value="Outfit">Outfit</option>
                      <option value="Arial">Arial</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Courier New">Courier New</option>
                      {systemFonts.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Font Size</label>
                      <input type="number" value={fontSize} onChange={(e) => modifyFontSize(Number(e.target.value))} className="w-full bg-dark-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none text-zinc-200" />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Styles</label>
                      <div className="flex gap-0.5 bg-dark-900 border border-zinc-800 p-0.5 rounded-lg h-7 items-center">
                        <button onClick={modifyWeight} className={`flex-1 py-0.5 rounded text-[10px] font-bold ${fontWeight === 'bold' ? 'bg-primary-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`} title="Bold">B</button>
                        <button onClick={modifyFontStyle} className={`flex-1 py-0.5 rounded text-[10px] italic font-semibold ${fontStyle === 'italic' ? 'bg-primary-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`} title="Italic">I</button>
                        <button onClick={modifyUnderline} className={`flex-1 py-0.5 rounded text-[10px] underline font-semibold ${underline ? 'bg-primary-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`} title="Underline">U</button>
                        <button onClick={modifyLinethrough} className={`flex-1 py-0.5 rounded text-[10px] line-through font-semibold ${linethrough ? 'bg-primary-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`} title="Strikethrough">S</button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Leading (Line Height)</label>
                      <input type="number" step={0.05} value={lineHeight} onChange={(e) => modifyLineHeight(Number(e.target.value))} className="w-full bg-dark-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none text-zinc-200" />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Tracking (Char Space)</label>
                      <input type="number" step={1} value={charSpacing} onChange={(e) => modifyCharSpacing(Number(e.target.value))} className="w-full bg-dark-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none text-zinc-200" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Text Color</label>
                      <div className="flex items-center gap-1.5 bg-dark-900 border border-zinc-800 rounded-lg p-1">
                        <input type="color" value={textColor} onChange={(e) => modifyColor(e.target.value)} className="w-5 h-5 rounded border border-zinc-800 cursor-pointer bg-transparent shrink-0" />
                        <input type="text" value={textColor} onChange={(e) => modifyColor(e.target.value)} className="w-full bg-transparent border-none text-[10px] focus:outline-none font-mono text-zinc-300" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Text Case</label>
                      <div className="flex gap-0.5 bg-dark-900 border border-zinc-800 p-0.5 rounded-lg h-7 items-center">
                        <button onClick={() => modifyTextCase('uppercase')} className="flex-1 py-0.5 text-[9px] font-extrabold text-zinc-400 hover:text-zinc-200" title="ALL CAPS">TT</button>
                        <button onClick={() => modifyTextCase('lowercase')} className="flex-1 py-0.5 text-[9px] font-semibold text-zinc-400 hover:text-zinc-200" title="lowercase">tt</button>
                        <button onClick={() => modifyTextCase('titlecase')} className="flex-1 py-0.5 text-[9px] font-bold text-zinc-400 hover:text-zinc-200" title="Title Case">Tt</button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Text Background Color</label>
                    <div className="flex items-center gap-1.5 bg-dark-900 border border-zinc-800 rounded-lg p-1">
                      <input type="color" value={textBackgroundColor === 'transparent' ? '#ffffff' : textBackgroundColor} onChange={(e) => modifyTextBackgroundColor(e.target.value)} className="w-5 h-5 rounded border border-zinc-800 cursor-pointer bg-transparent shrink-0" />
                      <input type="text" value={textBackgroundColor} onChange={(e) => modifyTextBackgroundColor(e.target.value)} placeholder="transparent" className="w-full bg-transparent border-none text-[10px] focus:outline-none font-mono text-zinc-300" />
                    </div>
                  </div>
                </div>

                {/* PARAGRAPH PANEL */}
                <div className="bg-dark-800/40 border border-zinc-800/80 rounded-xl p-3 space-y-2.5">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block border-b border-zinc-800/50 pb-1.5">
                    Paragraph
                  </label>
                  
                  <div>
                    <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">Alignment</label>
                    <div className="flex gap-0.5 bg-dark-900 border border-zinc-800 p-0.5 rounded-lg">
                      <button onClick={() => modifyAlign('left')} className="flex-1 py-1 rounded text-zinc-400 hover:text-zinc-200 flex justify-center hover:bg-zinc-850" title="Align Left"><AlignLeft className="w-3.5 h-3.5" /></button>
                      <button onClick={() => modifyAlign('center')} className="flex-1 py-1 rounded text-zinc-400 hover:text-zinc-200 flex justify-center hover:bg-zinc-850" title="Align Center"><AlignCenter className="w-3.5 h-3.5" /></button>
                      <button onClick={() => modifyAlign('right')} className="flex-1 py-1 rounded text-zinc-400 hover:text-zinc-200 flex justify-center hover:bg-zinc-850" title="Align Right"><AlignRight className="w-3.5 h-3.5" /></button>
                      <button onClick={() => modifyAlign('justify')} className="flex-1 py-1 rounded text-zinc-400 hover:text-zinc-200 flex justify-center hover:bg-zinc-850" title="Justify"><AlignJustify className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {((selectedObj as any).name === '{Photo}' || selectedObj.type === 'group') && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Placeholder Shape</label>
                  <select 
                    value={photoShape} 
                    onChange={(e) => modifyPhotoProperty('shape', e.target.value as 'rect' | 'circle')} 
                    className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                  >
                    <option value="rect">Rectangle</option>
                    <option value="circle">Circle</option>
                  </select>
                </div>
                {photoShape === 'rect' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Round X (rx)</label>
                      <input type="number" min={0} max={100} value={photoRx} onChange={(e) => modifyPhotoProperty('rx', e.target.value)} className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Round Y (ry)</label>
                      <input type="number" min={0} max={100} value={photoRy} onChange={(e) => modifyPhotoProperty('ry', e.target.value)} className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Border Color</label>
                  <div className="flex gap-2">
                    <input type="color" value={photoStroke} onChange={(e) => modifyPhotoProperty('stroke', e.target.value)} className="w-8 h-8 rounded border border-zinc-800 cursor-pointer bg-transparent" />
                    <input type="text" value={photoStroke} onChange={(e) => modifyPhotoProperty('stroke', e.target.value)} className="flex-1 bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none font-mono" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Border Width</label>
                  <input type="number" min={0} max={20} value={photoStrokeWidth} onChange={(e) => modifyPhotoProperty('strokeWidth', e.target.value)} className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Placeholder Fill</label>
                  <div className="flex gap-2">
                    <input type="color" value={photoFill} onChange={(e) => modifyPhotoProperty('fill', e.target.value)} className="w-8 h-8 rounded border border-zinc-800 cursor-pointer bg-transparent" />
                    <input type="text" value={photoFill} onChange={(e) => modifyPhotoProperty('fill', e.target.value)} className="flex-1 bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs focus:outline-none font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-zinc-850 pt-2">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Width (px)</label>
                    <input type="number" value={photoWidth} onChange={(e) => modifyPhotoProperty('width', e.target.value)} className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Height (px)</label>
                    <input type="number" value={photoHeight} onChange={(e) => modifyPhotoProperty('height', e.target.value)} className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Position X</label>
                    <input type="number" value={photoX} onChange={(e) => modifyPhotoProperty('x', e.target.value)} className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Position Y</label>
                    <input type="number" value={photoY} onChange={(e) => modifyPhotoProperty('y', e.target.value)} className="w-full bg-dark-800 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none" />
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4">
              <button onClick={deleteSelected} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs">
                <Trash2 className="w-3.5 h-3.5" /> Delete Layer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs py-8">
            <Layers className="w-8 h-8 stroke-[1.5] mb-2 opacity-50" />
            <p>Select any object on the canvas to configure properties.</p>
          </div>
        )}
      </div>
    </div>
  );
}
