import type { Student, Template } from '../hooks/useStore';

export type PreflightSeverity = 'error' | 'warning' | 'success';

export interface PreflightIssue {
  id: string;
  severity: PreflightSeverity;
  title: string;
  detail: string;
  count?: number;
  action: 'excel' | 'photos' | 'canvas' | 'preview' | 'print';
}

export interface PreflightReport {
  issues: PreflightIssue[];
  readyRecords: number;
  totalRecords: number;
  matchedPhotos: number;
  templateReady: boolean;
}

function collectPlaceholders(value: unknown, results: Set<string>) {
  if (typeof value === 'string') {
    for (const token of value.match(/\{[^}]+\}/g) || []) results.add(token);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPlaceholders(item, results));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectPlaceholders(item, results));
  }
}

export function getPreflightReport(
  students: Student[],
  template: Template | null,
  columns: string[],
  mappedFields: Record<string, string>
): PreflightReport {
  const issues: PreflightIssue[] = [];
  const matchedPhotos = students.filter((student) => Boolean(student.photoPath)).length;
  const duplicateRegisterNumbers = new Set<string>();
  const seenRegisterNumbers = new Set<string>();

  students.forEach((student) => {
    const key = student.registerNo.trim().toLocaleLowerCase();
    if (key && seenRegisterNumbers.has(key)) duplicateRegisterNumbers.add(key);
    if (key) seenRegisterNumbers.add(key);
  });

  if (!template) {
    issues.push({
      id: 'template-missing', severity: 'error', title: 'Create a card template',
      detail: 'A template is required before a preview or export can be generated.', action: 'canvas'
    });
  } else if (!template.frontDesign || template.frontDesign === '{}') {
    issues.push({
      id: 'template-empty', severity: 'error', title: 'Finish the card design',
      detail: 'The active template has no front-side design yet.', action: 'canvas'
    });
  } else {
    try {
      const placeholders = new Set<string>();
      collectPlaceholders(JSON.parse(template.frontDesign), placeholders);
      const unmapped = Array.from(placeholders).filter((token) => {
        if (token === '{Photo}') return false;
        const column = mappedFields[token] || token.slice(1, -1);
        return !columns.includes(column);
      });
      if (unmapped.length) {
        issues.push({
          id: 'unmapped-fields', severity: 'warning', title: 'Map template fields',
          detail: `${unmapped.slice(0, 3).join(', ')}${unmapped.length > 3 ? ` and ${unmapped.length - 3} more` : ''} do not match an imported column.`,
          count: unmapped.length, action: 'excel'
        });
      }
    } catch {
      issues.push({
        id: 'template-invalid', severity: 'error', title: 'Repair the template',
        detail: 'The saved template cannot be read. Open the designer and save it again.', action: 'canvas'
      });
    }
  }

  if (!students.length) {
    issues.push({
      id: 'records-missing', severity: 'error', title: 'Import records',
      detail: 'Import an Excel or CSV file to create ID cards.', action: 'excel'
    });
  }
  if (students.length && matchedPhotos !== students.length) {
    const missing = students.length - matchedPhotos;
    issues.push({
      id: 'photos-missing', severity: 'warning', title: 'Some photos are missing',
      detail: `${missing} record${missing === 1 ? '' : 's'} will export without a matched photo.`, count: missing, action: 'photos'
    });
  }
  if (duplicateRegisterNumbers.size) {
    issues.push({
      id: 'duplicate-register-number', severity: 'warning', title: 'Duplicate register numbers',
      detail: 'Duplicate identifiers can overwrite files when using register number in the export name.', count: duplicateRegisterNumbers.size, action: 'excel'
    });
  }

  const readyRecords = template && students.length ? students.filter((student) => Boolean(student.photoPath)).length : 0;
  return {
    issues,
    readyRecords,
    totalRecords: students.length,
    matchedPhotos,
    templateReady: Boolean(template?.frontDesign && template.frontDesign !== '{}')
  };
}