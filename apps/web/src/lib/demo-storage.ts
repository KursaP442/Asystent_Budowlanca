const demoPrefix = "asystent-codespace-demo";

export function demoConstructionStorageKey(jobId: string) {
  return `${demoPrefix}:${jobId}:construction`;
}

export function demoDocumentationStorageKey(jobId: string) {
  return `${demoPrefix}:${jobId}:documentation`;
}

export function demoCadDrawingStorageKey(jobId: string, requirementId: string) {
  return `${demoPrefix}:${jobId}:cad:${requirementId}`;
}

export function readDemoValue(key: string): unknown {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(key);
  return value ? JSON.parse(value) as unknown : null;
}

export function writeDemoValue(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listDemoCadDrawings(jobId: string): unknown[] {
  if (typeof window === "undefined") return [];
  const prefix = `${demoPrefix}:${jobId}:cad:`;
  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => readDemoValue(key));
}