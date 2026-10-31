import { ensureCatalogScenes, normalizeSceneDurations } from './scenes';
import { STORAGE_KEY, type ProjectDocument } from './types';
import { createEmptyProject, parseProjectDocument, pruneEmptyPolygons } from './validation';

export function loadProjectFromStorage(): ProjectDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyProject();
    const result = parseProjectDocument(raw);
    if (!result.ok || !result.value) return createEmptyProject();
    // Normalize to v2, drop empty polygons, slow spiders, add new catalog figures.
    const cleaned = ensureCatalogScenes(
      normalizeSceneDurations(pruneEmptyPolygons(result.value)),
    );
    saveProjectToStorage(cleaned);
    return cleaned;
  } catch {
    return createEmptyProject();
  }
}

export function saveProjectToStorage(doc: ProjectDocument): void {
  const next: ProjectDocument = {
    ...doc,
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function exportProjectJson(doc: ProjectDocument): string {
  const next: ProjectDocument = {
    ...doc,
    meta: { ...doc.meta, updatedAt: new Date().toISOString() },
  };
  return JSON.stringify(next, null, 2);
}

export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
