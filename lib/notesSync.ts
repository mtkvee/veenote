export type Label = {
  id: string;
  name: string;
  isOptimistic?: boolean;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  labelIds: string[];
  labelNames: string[];
  updatedAtMs: number;
};

export type SyncMutation =
  | {
      id: string;
      type: "label_upsert";
      label: { id: string; name: string };
    }
  | {
      id: string;
      type: "label_delete";
      labelId: string;
    }
  | {
      id: string;
      type: "note_upsert";
      note: {
        id: string;
        title: string;
        body: string;
        labelIds: string[];
        labelNames: string[];
        updatedAtMs: number;
      };
    }
  | {
      id: string;
      type: "note_delete";
      noteId: string;
    };

const queueKeyForUser = (uid: string) => `note-sync-queue-v1:${uid}`;

export const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

export const loadQueue = (uid: string): SyncMutation[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(queueKeyForUser(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncMutation[]) : [];
  } catch {
    return [];
  }
};

export const saveQueue = (uid: string, queue: SyncMutation[]) => {
  if (typeof window === "undefined") return;
  if (queue.length === 0) {
    window.localStorage.removeItem(queueKeyForUser(uid));
    return;
  }
  window.localStorage.setItem(queueKeyForUser(uid), JSON.stringify(queue));
};

export const applyQueueToLabels = (base: Label[], queue: SyncMutation[]) => {
  const map = new Map(base.map((label) => [label.id, { ...label }]));
  queue.forEach((mutation) => {
    if (mutation.type === "label_upsert") {
      map.set(mutation.label.id, {
        id: mutation.label.id,
        name: mutation.label.name,
        isOptimistic: true,
      });
    }
    if (mutation.type === "label_delete") {
      map.delete(mutation.labelId);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const applyQueueToNotes = (base: Note[], queue: SyncMutation[]) => {
  const map = new Map(base.map((note) => [note.id, { ...note }]));
  queue.forEach((mutation) => {
    if (mutation.type === "note_upsert") {
      map.set(mutation.note.id, { ...mutation.note });
    }
    if (mutation.type === "note_delete") {
      map.delete(mutation.noteId);
    }
    if (mutation.type === "label_delete") {
      const allNotes = Array.from(map.values()).map((note) => {
        const idx = note.labelIds.indexOf(mutation.labelId);
        if (idx === -1) return note;
        const nextIds = note.labelIds.filter((id) => id !== mutation.labelId);
        const nextNames = note.labelNames.filter((_, i) => i !== idx);
        return { ...note, labelIds: nextIds, labelNames: nextNames };
      });
      map.clear();
      allNotes.forEach((note) => map.set(note.id, note));
    }
  });
  return Array.from(map.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs);
};

export const mapFirestoreNote = (
  id: string,
  data: {
    title?: string;
    body?: string;
    labelIds?: string[];
    labelNames?: string[];
    labelId?: string;
    labelName?: string;
    updatedAtMs?: number;
    updatedAt?: { toMillis: () => number };
  },
): Note => {
  const labelIds =
    Array.isArray(data.labelIds) && data.labelIds.length > 0
      ? data.labelIds
      : data.labelId && data.labelId !== "none"
        ? [data.labelId]
        : [];
  const labelNames =
    Array.isArray(data.labelNames) && data.labelNames.length > 0
      ? data.labelNames
      : data.labelName && data.labelName !== "No label"
        ? [data.labelName]
        : [];

  return {
    id,
    title: data.title ?? "",
    body: data.body ?? "",
    labelIds,
    labelNames,
    updatedAtMs: data.updatedAtMs ?? data.updatedAt?.toMillis?.() ?? 0,
  };
};
