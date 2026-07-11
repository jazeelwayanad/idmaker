import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let db: sqlite3.Database;

export function initDatabase() {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  const dbPath = path.join(userDataPath, 'database.db');
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to connect to local database:', err);
    } else {
      console.log('Connected to local SQLite database:', dbPath);
    }
  });

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON;');

  // Create tables
  db.serialize(() => {
    // Projects table
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        settings TEXT
      )
    `);

    // Templates table
    db.run(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        name TEXT NOT NULL,
        width REAL DEFAULT 85.6,
        height REAL DEFAULT 53.98,
        unit TEXT DEFAULT 'mm',
        frontDesign TEXT,
        backDesign TEXT,
        fieldMapping TEXT,
        conditionalRules TEXT,
        paperSize TEXT DEFAULT 'A4',
        layout TEXT,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Students table
    db.run(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        registerNo TEXT,
        name TEXT,
        photoPath TEXT,
        data TEXT,
        errors TEXT,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Exports table
    db.run(`
      CREATE TABLE IF NOT EXISTS exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filePath TEXT NOT NULL,
        type TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        count INTEGER NOT NULL,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
  });
}

// Helper wrappers for async operations
export function dbRun(sql: string, params: any[] = []): Promise<{ id: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID });
    });
  });
}

export function dbGet<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T);
    });
  });
}

export function dbAll<T>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}
