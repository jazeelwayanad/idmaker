import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import { 
  initDatabase, 
  dbRun, 
  dbGet, 
  dbAll 
} from './db';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import * as XLSX from 'xlsx';
import { pathToFileURL } from 'url';

// Register custom protocols
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'local-photo', privileges: { bypassCSP: true, secure: true, supportFetchAPI: true } }
]);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const iconPath = app.isPackaged 
    ? path.join(__dirname, '../../out/logo.png')
    : path.join(__dirname, '../../public/logo.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Bulk ID Card Production System",
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined
  });

  if (app.isPackaged) {
    mainWindow.loadURL('app://idmaker');
  } else {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  initDatabase();
  
  // Handle app:// protocol requests for production Next.js files
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let urlPath = url.pathname;
      if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
      }
      
      const ext = path.extname(urlPath);
      if (!ext && urlPath !== '/') {
        urlPath += '.html';
      }
      
      const filePath = path.join(__dirname, '../../out', urlPath);
      if (fs.existsSync(filePath)) {
        return net.fetch(pathToFileURL(filePath).toString());
      } else {
        return net.fetch(pathToFileURL(path.join(__dirname, '../../out/index.html')).toString());
      }
    } catch (err) {
      console.error('Failed to handle app protocol:', err);
      return new Response('Not Found', { status: 404 });
    }
  });

  // Handle local-photo:// protocol requests
  protocol.handle('local-photo', (request) => {
    try {
      let filePath = new URL(request.url).pathname;
      filePath = decodeURIComponent(filePath);
      // On Windows, resolve leading slash from drive letter if present (e.g. /C:/...)
      if (filePath.startsWith('/') && filePath[2] === ':') {
        filePath = filePath.substring(1);
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      console.error('Failed to handle local-photo protocol:', err);
      return new Response('Not Found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Projects
ipcMain.handle('projects:list', async () => {
  return await dbAll('SELECT * FROM projects ORDER BY updatedAt DESC');
});

ipcMain.handle('projects:get', async (_, id: number) => {
  return await dbGet('SELECT * FROM projects WHERE id = ?', [id]);
});

ipcMain.handle('projects:create', async (_, name: string, settings: any) => {
  const now = new Date().toISOString();
  const res = await dbRun(
    'INSERT INTO projects (name, createdAt, updatedAt, settings) VALUES (?, ?, ?, ?)',
    [name, now, now, JSON.stringify(settings)]
  );
  // Also create a default template for this project
  await dbRun(
    'INSERT INTO templates (projectId, name, frontDesign, backDesign, fieldMapping, conditionalRules, layout) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [res.id, 'Default Template', '{}', '{}', '{}', '[]', '{}']
  );
  return res;
});

ipcMain.handle('projects:update', async (_, id: number, name: string, settings: any) => {
  const now = new Date().toISOString();
  return await dbRun(
    'UPDATE projects SET name = ?, settings = ?, updatedAt = ? WHERE id = ?',
    [name, JSON.stringify(settings), now, id]
  );
});

ipcMain.handle('projects:delete', async (_, id: number) => {
  return await dbRun('DELETE FROM projects WHERE id = ?', [id]);
});

// IPC Handler: Templates
ipcMain.handle('templates:get', async (_, projectId: number) => {
  return await dbGet('SELECT * FROM templates WHERE projectId = ?', [projectId]);
});

const ensureString = (val: any) => {
  if (val === null || val === undefined) return '';
  return typeof val === 'string' ? val : JSON.stringify(val);
};

ipcMain.handle('templates:save', async (_, template: any) => {
  const { id, projectId, name, width, height, unit, frontDesign, backDesign, fieldMapping, conditionalRules, paperSize, layout } = template;
  if (id) {
    return await dbRun(
      `UPDATE templates SET 
        name = ?, width = ?, height = ?, unit = ?, 
        frontDesign = ?, backDesign = ?, fieldMapping = ?, 
        conditionalRules = ?, paperSize = ?, layout = ? 
       WHERE id = ?`,
      [
        name, width, height, unit, 
        ensureString(frontDesign), ensureString(backDesign), ensureString(fieldMapping), 
        ensureString(conditionalRules), paperSize, ensureString(layout), id
      ]
    );
  } else {
    return await dbRun(
      `INSERT INTO templates 
        (projectId, name, width, height, unit, frontDesign, backDesign, fieldMapping, conditionalRules, paperSize, layout) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId, name, width, height, unit, 
        ensureString(frontDesign), ensureString(backDesign), ensureString(fieldMapping), 
        ensureString(conditionalRules), paperSize, ensureString(layout)
      ]
    );
  }
});

// IPC Handler: Students
ipcMain.handle('students:list', async (_, projectId: number) => {
  return await dbAll('SELECT * FROM students WHERE projectId = ?', [projectId]);
});

ipcMain.handle('students:import', async (_, projectId: number, students: any[]) => {
  // Clear old student records first
  await dbRun('DELETE FROM students WHERE projectId = ?', [projectId]);
  
  await dbRun('BEGIN TRANSACTION');
  try {
    for (const s of students) {
      await dbRun(
        'INSERT INTO students (projectId, registerNo, name, photoPath, data, errors) VALUES (?, ?, ?, ?, ?, ?)',
        [
          projectId, 
          String(s.registerNo || s.regNo || s.rollNo || s.id || ''), 
          s.name || '', 
          s.photoPath || '', 
          JSON.stringify(s), 
          JSON.stringify(s.errors || [])
        ]
      );
    }
    await dbRun('COMMIT');
  } catch (err) {
    await dbRun('ROLLBACK');
    console.error('Failed to import students in transaction:', err);
    throw err;
  }
  return { success: true, count: students.length };
});

ipcMain.handle('students:updatePhoto', async (_, id: number, photoPath: string) => {
  return await dbRun('UPDATE students SET photoPath = ? WHERE id = ?', [photoPath, id]);
});

ipcMain.handle('students:clear', async (_, projectId: number) => {
  return await dbRun('DELETE FROM students WHERE projectId = ?', [projectId]);
});

// IPC Handler: Exports
ipcMain.handle('exports:list', async (_, projectId: number) => {
  return await dbAll('SELECT * FROM exports WHERE projectId = ? ORDER BY createdAt DESC', [projectId]);
});

ipcMain.handle('exports:create', async (_, exportData: any) => {
  const { projectId, filename, filePath, type, count } = exportData;
  const now = new Date().toISOString();
  return await dbRun(
    'INSERT INTO exports (projectId, filename, filePath, type, createdAt, count) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, filename, filePath, type, now, count]
  );
});

// IPC Handler: Files & Local Operations
ipcMain.handle('files:getSystemFonts', async () => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('powershell -Command "Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families.Name"');
      const fonts = stdout.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
      return Array.from(new Set(fonts)).sort();
    } else if (process.platform === 'darwin') {
      const { stdout } = await execAsync('fc-list : family | sort -u');
      const fonts = stdout.split(/\r?\n/).map(f => f.trim().split(',')[0]).filter(Boolean);
      return Array.from(new Set(fonts)).sort();
    } else {
      const { stdout } = await execAsync('fc-list : family | sort -u');
      const fonts = stdout.split(/\r?\n/).map(f => f.trim().split(',')[0]).filter(Boolean);
      return Array.from(new Set(fonts)).sort();
    }
  } catch (err) {
    console.error('Failed to get system fonts:', err);
    return ['Arial', 'Courier New', 'Georgia', 'Segoe UI', 'Times New Roman', 'Verdana', 'Outfit'];
  }
});

ipcMain.handle('files:selectExcel', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls', 'csv'] }
    ]
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

ipcMain.handle('files:readExcel', async (_, filePath: string) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[];
    return { data, headers };
  } catch (err: any) {
    console.error('Error reading Excel:', err);
    throw new Error(err.message || 'Failed to read Excel file');
  }
});

ipcMain.handle('files:selectFolder', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

ipcMain.handle('files:matchPhotos', async (_, folderPath: string, students: any[], matchField: string) => {
  try {
    const files = await fs.promises.readdir(folderPath);
    const fileMap = new Map<string, string>();
    
    // Normalize keys to find matches
    files.forEach(f => {
      const ext = path.extname(f);
      const base = path.basename(f, ext).toLowerCase().trim();
      fileMap.set(base, path.join(folderPath, f));
    });

    const fileMapKeys = Array.from(fileMap.keys());

    const updatedStudents = students.map(student => {
      // Strip any file extension from match value (user data may contain .jpg, .png, etc.)
      const rawVal = String(student[matchField] || '').toLowerCase().trim();
      const matchVal = rawVal.replace(/\.(jpg|jpeg|png|gif|bmp|webp|tiff|svg)$/i, '');
      let photoPath = '';
      let errors = student.errors || [];

      // Try exact filename match (without extension)
      if (matchVal && fileMap.has(matchVal)) {
        photoPath = fileMap.get(matchVal)!;
      } else {
        // Try containing match
        const foundKey = fileMapKeys.find(k => k.includes(matchVal) || matchVal.includes(k));
        if (foundKey) {
          photoPath = fileMap.get(foundKey)!;
        }
      }

      // Filter out duplicate missing photo notices
      errors = errors.filter((e: string) => e !== 'Photo Missing');
      if (!photoPath) {
        errors.push('Photo Missing');
      }

      return {
        ...student,
        photoPath,
        errors
      };
    });

    return updatedStudents;
  } catch (err) {
    console.error('Error matching photos:', err);
    return students;
  }
});

ipcMain.handle('files:saveFile', async (_, filename: string, content: string, encoding: any = 'utf8', directory?: string) => {
  if (!mainWindow) return null;
  let filePath = '';
  if (directory) {
    filePath = require('path').join(directory, filename);
  } else {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename
    });
    if (res.canceled || !res.filePath) return null;
    filePath = res.filePath;
  }
  
  await fs.promises.writeFile(filePath, content, encoding);
  return filePath;
});

ipcMain.handle('files:openDirectory', async (_, dirPath: string) => {
  if (fs.existsSync(dirPath)) {
    shell.openPath(dirPath);
    return true;
  }
  return false;
});

ipcMain.handle('files:readAsBase64', async (_, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).replace('.', '');
    return `data:image/${ext};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.error('Error reading local file to base64:', err);
    return null;
  }
});

ipcMain.handle('files:exportZip', async (_, outputPath: string, files: { name: string; buffer: ArrayBuffer }[]) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(outputPath));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    files.forEach(f => {
      archive.append(Buffer.from(f.buffer), { name: f.name });
    });

    archive.finalize();
  });
});

// A4 default sizes in points (72 points/inch)
// 1 mm = 2.83465 points
const MM_TO_PT = 2.83465;

ipcMain.handle('files:exportPdf', async (_, outputPath: string, options: any, cards: { front: string; back?: string; data: any }[]) => {
  return new Promise((resolve, reject) => {
    try {
      const {
        paperSize = 'A4',
        layout = { rows: 4, cols: 2, margin: 10, spacing: 5, showCropMarks: true, layoutMode: 'grid', maxCards: 8, cardPositions: [] },
        cardSize = { width: 85.6, height: 53.98 } // in mm
      } = options;

      let pdfPaperSize: any = 'A4';
      const standardSizes = ['A4', 'A3', 'Letter', 'Legal'];
      const normalizedSize = typeof paperSize === 'string' ? paperSize.trim() : '';
      const matchedSize = standardSizes.find(s => s.toLowerCase() === normalizedSize.toLowerCase());

      if (matchedSize) {
        pdfPaperSize = matchedSize;
      } else {
        let customW = 210;
        let customH = 297;
        if (layout) {
          const w = Number(layout.customW);
          const h = Number(layout.customH);
          if (!isNaN(w) && w > 0) customW = w;
          if (!isNaN(h) && h > 0) customH = h;
        }
        pdfPaperSize = [customW * MM_TO_PT, customH * MM_TO_PT];
      }

      const doc = new PDFDocument({
        size: pdfPaperSize,
        margin: 0
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Card size in points
      const cardW = cardSize.width * MM_TO_PT;
      const cardH = cardSize.height * MM_TO_PT;

      const rows = Number(layout.rows) || 4;
      const cols = Number(layout.cols) || 2;
      const margin = (Number(layout.margin) || 10) * MM_TO_PT;
      const spacingX = (Number(layout.spacingX || layout.spacing || 5)) * MM_TO_PT;
      const spacingY = (Number(layout.spacingY || layout.spacing || 5)) * MM_TO_PT;

      const paperDimensions: Record<string, { w: number; h: number }> = {
        'A4': { w: 210, h: 297 },
        'A3': { w: 297, h: 420 },
        'Letter': { w: 215.9, h: 279.4 },
        'Legal': { w: 215.9, h: 355.6 }
      };

      let paperW = 210; // Default A4 in mm
      if (matchedSize) {
        const dim = paperDimensions[matchedSize];
        if (dim) paperW = dim.w;
      } else if (layout && layout.customW) {
        const w = Number(layout.customW);
        if (!isNaN(w) && w > 0) paperW = w;
      }

      let cardIndex = 0;

      while (cardIndex < cards.length) {
        if (cardIndex > 0) doc.addPage();

        let cardsOnThisPage = 0;

        if (layout.layoutMode === 'custom') {
          const maxCards = Number(layout.maxCards) || 8;
          const positions = layout.cardPositions || [];

          for (let i = 0; i < maxCards; i++) {
            if (cardIndex >= cards.length) break;

            const card = cards[cardIndex];
            const pos = positions[i] || {
              x: (Number(layout.margin) || 10) + (i % cols) * (cardSize.width + (Number(layout.spacing) || 5)),
              y: (Number(layout.margin) || 10) + Math.floor(i / cols) * (cardSize.height + (Number(layout.spacing) || 5))
            };

            const x = pos.x * MM_TO_PT;
            const y = pos.y * MM_TO_PT;

            if (card.front) {
              const frontBuffer = Buffer.from(card.front.replace(/^data:image\/\w+;base64,/, ""), 'base64');
              doc.image(frontBuffer, x, y, { width: cardW, height: cardH });
            }

            if (layout.showCropMarks) {
              doc.lineWidth(0.5).strokeColor('#cccccc');
              const length = 10;
              doc.moveTo(x - length, y).lineTo(x, y).stroke();
              doc.moveTo(x, y - length).lineTo(x, y).stroke();
              doc.moveTo(x + cardW, y).lineTo(x + cardW + length, y).stroke();
              doc.moveTo(x + cardW, y - length).lineTo(x + cardW, y).stroke();
              doc.moveTo(x - length, y + cardH).lineTo(x, y + cardH).stroke();
              doc.moveTo(x, y + cardH).lineTo(x, y + cardH + length).stroke();
              doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW + length, y + cardH).stroke();
              doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW, y + cardH + length).stroke();
            }

            cardIndex++;
            cardsOnThisPage++;
          }
        } else {
          // Standard Grid Mode
          const maxCards = layout.maxCards !== undefined ? Number(layout.maxCards) : (rows * cols);
          let countInGrid = 0;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (cardIndex >= cards.length || countInGrid >= maxCards) break;

              const card = cards[cardIndex];
              const x = margin + c * (cardW + spacingX);
              const y = margin + r * (cardH + spacingY);

              if (card.front) {
                const frontBuffer = Buffer.from(card.front.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                doc.image(frontBuffer, x, y, { width: cardW, height: cardH });
              }

              if (layout.showCropMarks) {
                doc.lineWidth(0.5).strokeColor('#cccccc');
                const length = 10;
                doc.moveTo(x - length, y).lineTo(x, y).stroke();
                doc.moveTo(x, y - length).lineTo(x, y).stroke();
                doc.moveTo(x + cardW, y).lineTo(x + cardW + length, y).stroke();
                doc.moveTo(x + cardW, y - length).lineTo(x + cardW, y).stroke();
                doc.moveTo(x - length, y + cardH).lineTo(x, y + cardH).stroke();
                doc.moveTo(x, y + cardH).lineTo(x, y + cardH + length).stroke();
                doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW + length, y + cardH).stroke();
                doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW, y + cardH + length).stroke();
              }

              cardIndex++;
              cardsOnThisPage++;
              countInGrid++;
            }
          }
        }

        // If back cards exist, add page pairing
        if (cards.some(c => c.back)) {
          doc.addPage();
          let backCardIndex = cardIndex - cardsOnThisPage;

          if (layout.layoutMode === 'custom') {
            const maxCards = Number(layout.maxCards) || 8;
            const positions = layout.cardPositions || [];

            for (let i = 0; i < maxCards; i++) {
              if (backCardIndex >= cards.length || backCardIndex >= cardIndex) break;

              const card = cards[backCardIndex];
              const pos = positions[i] || {
                x: (Number(layout.margin) || 10) + (i % cols) * (cardSize.width + (Number(layout.spacing) || 5)),
                y: (Number(layout.margin) || 10) + Math.floor(i / cols) * (cardSize.height + (Number(layout.spacing) || 5))
              };

              const mirroredX = paperW - cardSize.width - pos.x;
              const x = mirroredX * MM_TO_PT;
              const y = pos.y * MM_TO_PT;

              if (card.back) {
                const backBuffer = Buffer.from(card.back.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                doc.image(backBuffer, x, y, { width: cardW, height: cardH });
              }

              if (layout.showCropMarks) {
                doc.lineWidth(0.5).strokeColor('#cccccc');
                const length = 10;
                doc.moveTo(x - length, y).lineTo(x, y).stroke();
                doc.moveTo(x, y - length).lineTo(x, y).stroke();
                doc.moveTo(x + cardW, y).lineTo(x + cardW + length, y).stroke();
                doc.moveTo(x + cardW, y - length).lineTo(x + cardW, y).stroke();
                doc.moveTo(x - length, y + cardH).lineTo(x, y + cardH).stroke();
                doc.moveTo(x, y + cardH).lineTo(x, y + cardH + length).stroke();
                doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW + length, y + cardH).stroke();
                doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW, y + cardH + length).stroke();
              }

              backCardIndex++;
            }
          } else {
            // Standard Grid Back mirroring
            const maxCards = layout.maxCards !== undefined ? Number(layout.maxCards) : (rows * cols);
            let countInGrid = 0;
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                if (backCardIndex >= cards.length || backCardIndex >= cardIndex || countInGrid >= maxCards) break;

                const card = cards[backCardIndex];
                const mirroredCol = cols - 1 - c;
                const x = margin + mirroredCol * (cardW + spacingX);
                const y = margin + r * (cardH + spacingY);

                if (card.back) {
                  const backBuffer = Buffer.from(card.back.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                  doc.image(backBuffer, x, y, { width: cardW, height: cardH });
                }

                if (layout.showCropMarks) {
                  doc.lineWidth(0.5).strokeColor('#cccccc');
                  const length = 10;
                  doc.moveTo(x - length, y).lineTo(x, y).stroke();
                  doc.moveTo(x, y - length).lineTo(x, y).stroke();
                  doc.moveTo(x + cardW, y).lineTo(x + cardW + length, y).stroke();
                  doc.moveTo(x + cardW, y - length).lineTo(x + cardW, y).stroke();
                  doc.moveTo(x - length, y + cardH).lineTo(x, y + cardH).stroke();
                  doc.moveTo(x, y + cardH).lineTo(x, y + cardH + length).stroke();
                  doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW + length, y + cardH).stroke();
                  doc.moveTo(x + cardW, y + cardH).lineTo(x + cardW, y + cardH + length).stroke();
                }

                backCardIndex++;
                countInGrid++;
              }
            }
          }
        }
      }

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
});
