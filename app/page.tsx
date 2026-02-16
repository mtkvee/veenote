"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, UIEvent } from "react";
import Image from "next/image";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  DocumentData,
  QueryDocumentSnapshot,
  collection,
  getDocs,
  limit,
  orderBy,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  startAfter,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { auth, db, firebaseReady, googleProvider } from "@/lib/firebase";
import {
  applyQueueToLabels,
  applyQueueToNotes,
  loadQueue,
  mapFirestoreNote,
  newId,
  saveQueue,
} from "@/lib/notesSync";
import type { Label, Note, SyncMutation } from "@/lib/notesSync";
import "./page.css";

const NOTES_PAGE_SIZE = 40;
const MAX_SYNC_QUEUE_SIZE = 250;
const BASE_SYNC_INTERVAL_MS = 1200;
const MAX_BACKOFF_MS = 15000;
const MAX_HISTORY_SIZE = 200;
const HIDDEN_SYNC_WARNING =
  "Saved locally. Cloud sync will retry automatically.";

type FirestoreNoteData = {
  title?: string;
  body?: string;
  labelIds?: string[];
  labelNames?: string[];
  labelId?: string;
  labelName?: string;
  updatedAtMs?: number;
  updatedAt?: { toMillis: () => number };
};

type DraftHistory = {
  title: string;
  body: string;
};

function GoogleLogoIcon() {
  return (
    <svg
      className="googleLogoIcon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.86c2.26-2.08 3.57-5.14 3.57-8.66Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.86-3.01c-1.07.72-2.44 1.15-4.09 1.15-3.14 0-5.79-2.12-6.74-4.97H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.26 14.26A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.55.37-2.26v-3.1H1.28A12 12 0 0 0 0 12c0 1.93.46 3.75 1.28 5.36l3.98-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.81l3.44-3.44C17.95 1.2 15.23 0 12 0 7.31 0 3.25 2.69 1.28 6.64l3.98 3.1c.95-2.85 3.6-4.97 6.74-4.97Z"
      />
    </svg>
  );
}

type LabelTriggerGroupProps = {
  labelNames: string[];
  onOpen: () => void;
};

function LabelTriggerGroup({ labelNames, onOpen }: LabelTriggerGroupProps) {
  return (
    <div className="labelTriggerGroup">
      <button
        className="selectButton labelTriggerButton"
        type="button"
        onClick={onOpen}
      >
        Add label
      </button>
      {labelNames.map((labelName, index) => (
        <button
          key={`${labelName}-${index}`}
          className="selectButton labelTriggerButton"
          type="button"
          onClick={onOpen}
        >
          {labelName}
        </button>
      ))}
    </div>
  );
}

type NoteLabelPickerDialogProps = {
  open: boolean;
  labels: Label[];
  selectedIds: string[];
  namePrefix: string;
  onToggle: (id: string) => void;
  onClose: () => void;
};

function NoteLabelPickerDialog({
  open,
  labels,
  selectedIds,
  namePrefix,
  onToggle,
  onClose,
}: NoteLabelPickerDialogProps) {
  if (!open) return null;

  return (
    <div className="pickerBackdrop noteLabelPickerBackdrop" onClick={onClose}>
      <div className="noteLabelPickerDialog" onClick={(e) => e.stopPropagation()}>
        <div className="noteLabelOptions">
          {labels.map((label) => (
            <button
              key={label.id}
              className="noteLabelOption"
              type="button"
              onClick={() => onToggle(label.id)}
            >
              <input
                type="checkbox"
                name={`${namePrefix}_${label.id}`}
                checked={selectedIds.includes(label.id)}
                readOnly
              />
              <span>{label.name}</span>
            </button>
          ))}
        </div>
        <div className="noteLabelFooter">
          <button className="saveButton" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

type NotesGridProps = {
  visibleNotes: Note[];
  hasMoreNotes: boolean;
  loadingMoreNotes: boolean;
  search: string;
  selectedLabel: string;
  onOpenNote: (note: Note) => void;
  onCopyCardBody: (body: string) => Promise<void>;
  onLoadMoreNotes: () => void;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
};

function NotesGrid({
  visibleNotes,
  hasMoreNotes,
  loadingMoreNotes,
  search,
  selectedLabel,
  onOpenNote,
  onCopyCardBody,
  onLoadMoreNotes,
  onScroll,
}: NotesGridProps) {
  const shouldShowLoadMore =
    hasMoreNotes && search.trim().length === 0 && selectedLabel === "all";

  return (
    <div className="grid" onScroll={onScroll}>
      {visibleNotes.map((note) => (
        <article
          key={note.id}
          className="card cardInteractive"
          onClick={() => onOpenNote(note)}
        >
          <button
            className="cardCopyButton"
            type="button"
            aria-label="Copy note text"
            title="Copy text"
            onClick={(e) => {
              e.stopPropagation();
              void onCopyCardBody(note.body);
            }}
          >
            <i className="fa-solid fa-copy" aria-hidden="true" />
          </button>
          <h3 title={note.title}>
            {note.title.length > 12 ? `${note.title.slice(0, 12)}...` : note.title}
          </h3>
          <p>{note.body}</p>
          <time className="cardTime">
            {new Date(note.updatedAtMs).toLocaleDateString()}
          </time>
          {note.labelNames.length > 0 && (
            <footer>
              <div className="cardLabels">
                {note.labelNames
                  .slice()
                  .sort((a, b) => a.localeCompare(b))
                  .map((label) => (
                    <span className="cardLabelChip" key={`${note.id}-${label}`}>
                      <span className="cardLabelText">{label}</span>
                    </span>
                  ))}
              </div>
            </footer>
          )}
        </article>
      ))}
      {shouldShowLoadMore && (
        <button
          className="loadMoreButton"
          type="button"
          onClick={onLoadMoreNotes}
          disabled={loadingMoreNotes}
        >
          {loadingMoreNotes ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const [authLoading, setAuthLoading] = useState(firebaseReady);
  const [user, setUser] = useState<User | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [syncQueue, setSyncQueue] = useState<SyncMutation[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingMoreNotes, setLoadingMoreNotes] = useState(false);
  const [hasMoreNotes, setHasMoreNotes] = useState(false);
  const [notesCursor, setNotesCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [search, setSearch] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("all");
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editorUndoStack, setEditorUndoStack] = useState<DraftHistory[]>([]);
  const [editorRedoStack, setEditorRedoStack] = useState<DraftHistory[]>([]);
  const [noteLabels, setNoteLabels] = useState<string[]>([]);
  const [showEditorLabelPicker, setShowEditorLabelPicker] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showNoteLabelPicker, setShowNoteLabelPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState("");
  const [pendingDeleteNoteTitle, setPendingDeleteNoteTitle] = useState("");
  const [activeNoteId, setActiveNoteId] = useState("");
  const [activeNoteTitle, setActiveNoteTitle] = useState("");
  const [activeNoteBody, setActiveNoteBody] = useState("");
  const [dialogUndoStack, setDialogUndoStack] = useState<DraftHistory[]>([]);
  const [dialogRedoStack, setDialogRedoStack] = useState<DraftHistory[]>([]);
  const [activeNoteLabels, setActiveNoteLabels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isNotesListAtTop, setIsNotesListAtTop] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<SyncMutation[]>([]);
  const syncInFlightRef = useRef(false);
  const nextSyncAttemptAtRef = useRef(0);
  const syncIntervalRef = useRef(BASE_SYNC_INTERVAL_MS);
  const firstPageNoteIdsRef = useRef<Set<string>>(new Set());
  const hasMainOverlayOpen =
    showLabelManager ||
    showFilterPicker ||
    showNoteDialog ||
    showNoteLabelPicker ||
    showDeleteConfirm;

  const displayedLabels = useMemo(
    () => labels.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [labels],
  );

  const getSelectedLabels = useCallback(
    (selectedIds: string[]) => {
      const selectedIdSet = new Set(selectedIds);
      return displayedLabels.filter((label) => selectedIdSet.has(label.id));
    },
    [displayedLabels],
  );

  const getSelectedLabelNames = useCallback(
    (selectedIds: string[]) =>
      getSelectedLabels(selectedIds).map((label) => label.name),
    [getSelectedLabels],
  );

  const resetNewNoteDraft = useCallback(() => {
    setNoteTitle("");
    setNoteBody("");
    setNoteLabels([]);
    setEditorUndoStack([]);
    setEditorRedoStack([]);
  }, []);

  useEffect(() => {
    if (!firebaseReady || !auth) return;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLabels([]);
        setNotes([]);
        setSyncQueue([]);
        setHasMoreNotes(false);
        setNotesCursor(null);
        firstPageNoteIdsRef.current = new Set();
        setLoadingData(false);
      } else {
        const queued = loadQueue(currentUser.uid);
        setSyncQueue(queued);
        setLabels(applyQueueToLabels([], queued));
        setNotes(applyQueueToNotes([], queued));
        setHasMoreNotes(false);
        setNotesCursor(null);
        firstPageNoteIdsRef.current = new Set();
        setLoadingData(true);
      }
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    queueRef.current = syncQueue;
    if (user) saveQueue(user.uid, syncQueue);
  }, [syncQueue, user]);

  useEffect(() => {
    if (!user || !db) return;

    const labelsRef = collection(db, "users", user.uid, "labels");
    const notesRef = collection(db, "users", user.uid, "notes");

    const unsubscribeLabels = onSnapshot(labelsRef, (snapshot) => {
      const incoming = snapshot.docs.map((docItem) => {
        const data = docItem.data() as { name?: string };
        return { id: docItem.id, name: data.name ?? "" };
      });
      setLabels(applyQueueToLabels(incoming, queueRef.current));
    });

    const firstPageQuery = query(
      notesRef,
      orderBy("updatedAtMs", "desc"),
      limit(NOTES_PAGE_SIZE),
    );

    const unsubscribeNotes = onSnapshot(firstPageQuery, (snapshot) => {
      const incoming = snapshot.docs.map((docItem) =>
        mapFirestoreNote(docItem.id, docItem.data() as FirestoreNoteData),
      );
      incoming.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      const prevFirstPageIds = firstPageNoteIdsRef.current;
      const nextFirstPageIds = new Set(incoming.map((note) => note.id));
      firstPageNoteIdsRef.current = nextFirstPageIds;

      setHasMoreNotes(snapshot.docs.length === NOTES_PAGE_SIZE);
      setNotesCursor(snapshot.docs.at(-1) ?? null);
      setNotes((prev) => {
        const preservedOlderNotes = prev.filter(
          (note) =>
            !prevFirstPageIds.has(note.id) && !nextFirstPageIds.has(note.id),
        );
        return applyQueueToNotes(
          [...incoming, ...preservedOlderNotes],
          queueRef.current,
        );
      });
      setLoadingData(false);
    });

    return () => {
      unsubscribeLabels();
      unsubscribeNotes();
    };
  }, [user]);

  const enqueueMutations = useCallback((mutations: SyncMutation[]) => {
    if (mutations.length === 0) return;
    setSyncQueue((prev) => {
      let next = [...prev];
      mutations.forEach((mutation) => {
        if (mutation.type === "note_upsert") {
          next = next.filter(
            (item) =>
              !(
                item.type === "note_upsert" && item.note.id === mutation.note.id
              ),
          );
          next.push(mutation);
          return;
        }
        if (mutation.type === "label_upsert") {
          next = next.filter(
            (item) =>
              !(
                item.type === "label_upsert" &&
                item.label.id === mutation.label.id
              ),
          );
          next.push(mutation);
          return;
        }
        if (mutation.type === "note_delete") {
          next = next.filter(
            (item) =>
              !(
                (item.type === "note_upsert" &&
                  item.note.id === mutation.noteId) ||
                (item.type === "note_delete" && item.noteId === mutation.noteId)
              ),
          );
          next.push(mutation);
          return;
        }
        next = next.filter(
          (item) =>
            !(
              (item.type === "label_upsert" &&
                item.label.id === mutation.labelId) ||
              (item.type === "label_delete" &&
                item.labelId === mutation.labelId)
            ),
        );
        next.push(mutation);
      });
      if (next.length > MAX_SYNC_QUEUE_SIZE) {
        next = next.slice(next.length - MAX_SYNC_QUEUE_SIZE);
      }
      return next;
    });
  }, []);

  const flushQueue = useCallback(async () => {
    if (!db || !user || syncInFlightRef.current) return;
    if (queueRef.current.length === 0) return;
    if (Date.now() < nextSyncAttemptAtRef.current) return;
    syncInFlightRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        if (next.type === "label_upsert") {
          await setDoc(
            doc(db, "users", user.uid, "labels", next.label.id),
            {
              name: next.label.name,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else if (next.type === "label_delete") {
          await deleteDoc(doc(db, "users", user.uid, "labels", next.labelId));
        } else if (next.type === "note_upsert") {
          const labelId = next.note.labelIds[0] ?? "none";
          const labelName = next.note.labelNames[0] ?? "No label";
          await setDoc(
            doc(db, "users", user.uid, "notes", next.note.id),
            {
              title: next.note.title,
              body: next.note.body,
              labelIds: next.note.labelIds,
              labelNames: next.note.labelNames,
              labelId,
              labelName,
              updatedAtMs: next.note.updatedAtMs,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          await deleteDoc(doc(db, "users", user.uid, "notes", next.noteId));
        }

        setSyncQueue((prev) => {
          if (prev.length === 0) return prev;
          if (prev[0].id === next.id) return prev.slice(1);
          return prev.filter((item) => item.id !== next.id);
        });
      }
      syncIntervalRef.current = BASE_SYNC_INTERVAL_MS;
      nextSyncAttemptAtRef.current = 0;
      setError("");
    } catch {
      syncIntervalRef.current = Math.min(
        syncIntervalRef.current * 2,
        MAX_BACKOFF_MS,
      );
      nextSyncAttemptAtRef.current = Date.now() + syncIntervalRef.current;
      setError(HIDDEN_SYNC_WARNING);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!db) return;
    if (queueRef.current.length === 0) return;
    const timer = window.setInterval(() => {
      void flushQueue();
    }, BASE_SYNC_INTERVAL_MS);
    const onlineHandler = () => {
      void flushQueue();
    };
    window.addEventListener("online", onlineHandler);
    void flushQueue();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onlineHandler);
    };
  }, [flushQueue, syncQueue.length]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!search.trim()) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (searchInputRef.current?.contains(target)) return;

      const element = target instanceof Element ? target : null;
      if (
        element?.closest(
          "button, a, input, textarea, select, label, [role='button']",
        )
      ) {
        return;
      }

      setSearch("");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [search]);

  const handleLoadMoreNotes = useCallback(async () => {
    if (!db || !user || !notesCursor || loadingMoreNotes || !hasMoreNotes)
      return;
    setLoadingMoreNotes(true);
    try {
      const notesRef = collection(db, "users", user.uid, "notes");
      const nextPage = query(
        notesRef,
        orderBy("updatedAtMs", "desc"),
        startAfter(notesCursor),
        limit(NOTES_PAGE_SIZE),
      );
      const snapshot = await getDocs(nextPage);
      const incoming = snapshot.docs.map((docItem) =>
        mapFirestoreNote(docItem.id, docItem.data() as FirestoreNoteData),
      );
      setNotesCursor(snapshot.docs.at(-1) ?? notesCursor);
      setHasMoreNotes(snapshot.docs.length === NOTES_PAGE_SIZE);
      setNotes((prev) => {
        const seen = new Set(prev.map((note) => note.id));
        const merged = [...prev];
        incoming.forEach((note) => {
          if (!seen.has(note.id)) merged.push(note);
        });
        return applyQueueToNotes(merged, queueRef.current);
      });
    } finally {
      setLoadingMoreNotes(false);
    }
  }, [hasMoreNotes, loadingMoreNotes, notesCursor, user]);

  const handleNotesScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const top = event.currentTarget.scrollTop <= 0;
      if (top !== isNotesListAtTop) setIsNotesListAtTop(top);
    },
    [isNotesListAtTop],
  );

  const visibleNotes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return notes.filter((note) => {
      const labelMatches =
        selectedLabel === "all" || note.labelIds.includes(selectedLabel);
      const textMatches =
        keyword.length === 0 ||
        note.title.toLowerCase().includes(keyword) ||
        note.body.toLowerCase().includes(keyword);
      return labelMatches && textMatches;
    });
  }, [notes, search, selectedLabel]);

  useEffect(() => {
    if (loadingData || visibleNotes.length === 0) {
      setIsNotesListAtTop(true);
    }
  }, [loadingData, visibleNotes.length]);

  const labelNoteCounts = useMemo(() => {
    const counts: Record<string, number> = { none: 0 };
    notes.forEach((note) => {
      if (note.labelIds.length === 0) {
        counts.none = (counts.none ?? 0) + 1;
        return;
      }
      note.labelIds.forEach((key) => {
        counts[key] = (counts[key] ?? 0) + 1;
      });
    });
    return counts;
  }, [notes]);

  const handleSignIn = async () => {
    if (!auth) return;
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Sign-in failed. Please allow popups and try again.";
      setError(message);
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  const handleCreateLabel = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const name = newLabel.trim();
    if (!name) return;
    const exists = displayedLabels.some(
      (label) => label.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setError("Label already exists.");
      return;
    }

    const labelId = newId("label");
    setError("");
    setNewLabel("");
    const mutation: SyncMutation = {
      id: newId("mutation"),
      type: "label_upsert",
      label: { id: labelId, name },
    };
    setLabels((prev) => applyQueueToLabels(prev, [mutation]));
    enqueueMutations([mutation]);
  };

  const handleDeleteLabel = (labelId: string) => {
    if (!user) return;
    const noteMutations: SyncMutation[] = [];
    const deleteMutation: SyncMutation = {
      id: newId("mutation"),
      type: "label_delete",
      labelId,
    };

    setLabels((prev) => applyQueueToLabels(prev, [deleteMutation]));
    setNotes((prev) =>
      prev.map((note) => {
        const index = note.labelIds.indexOf(labelId);
        if (index === -1) return note;
        const nextLabelIds = note.labelIds.filter((id) => id !== labelId);
        const nextLabelNames = note.labelNames.filter(
          (_, idx) => idx !== index,
        );
        const updatedNote: Note = {
          ...note,
          labelIds: nextLabelIds,
          labelNames: nextLabelNames,
          updatedAtMs: Date.now(),
        };
        noteMutations.push({
          id: newId("mutation"),
          type: "note_upsert",
          note: {
            id: updatedNote.id,
            title: updatedNote.title,
            body: updatedNote.body,
            labelIds: updatedNote.labelIds,
            labelNames: updatedNote.labelNames,
            updatedAtMs: updatedNote.updatedAtMs,
          },
        });
        return updatedNote;
      }),
    );
    enqueueMutations([deleteMutation, ...noteMutations]);
    if (selectedLabel === labelId) setSelectedLabel("all");
    setNoteLabels((prev) => prev.filter((id) => id !== labelId));
    setActiveNoteLabels((prev) => prev.filter((id) => id !== labelId));
  };

  const handleSaveNote = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const title = noteTitle.trim();
    const body = noteBody.trim();
    if (!body) return;

    const selectedLabels = getSelectedLabels(noteLabels);
    const labelIds = selectedLabels.map((label) => label.id);
    const labelNames = selectedLabels.map((label) => label.name);
    const optimisticId = newId("note");
    const now = Date.now();
    const optimisticNote: Note = {
      id: optimisticId,
      title,
      body,
      labelIds,
      labelNames,
      updatedAtMs: now,
    };

    setError("");
    setNotes((prev) => [optimisticNote, ...prev]);
    setLoadingData(false);

    resetNewNoteDraft();
    setShowEditor(false);
    enqueueMutations([
      {
        id: newId("mutation"),
        type: "note_upsert",
        note: {
          id: optimisticId,
          title,
          body,
          labelIds,
          labelNames,
          updatedAtMs: now,
        },
      },
    ]);
  };

  const handleCancelEditor = () => {
    resetNewNoteDraft();
    setShowEditorLabelPicker(false);
    setShowEditor(false);
  };

  const noteLabelNames = getSelectedLabelNames(noteLabels);
  const activeNoteLabelNames = getSelectedLabelNames(activeNoteLabels);

  const openNoteDialog = (note: Note) => {
    setError("");
    setActiveNoteId(note.id);
    setActiveNoteTitle(note.title);
    setActiveNoteBody(note.body);
    setActiveNoteLabels(note.labelIds);
    setDialogUndoStack([]);
    setDialogRedoStack([]);
    setShowNoteDialog(true);
  };

  const closeNoteDialog = () => {
    setShowNoteDialog(false);
    setShowNoteLabelPicker(false);
    setActiveNoteId("");
    setActiveNoteTitle("");
    setActiveNoteBody("");
    setDialogUndoStack([]);
    setDialogRedoStack([]);
    setActiveNoteLabels([]);
  };

  const pushHistory = (
    stack: DraftHistory[],
    snapshot: DraftHistory,
  ): DraftHistory[] => {
    const last = stack.at(-1);
    if (last && last.title === snapshot.title && last.body === snapshot.body) {
      return stack;
    }
    const next = [...stack, snapshot];
    if (next.length > MAX_HISTORY_SIZE) {
      next.shift();
    }
    return next;
  };

  const isWordBoundaryChar = (char: string | undefined) =>
    char === undefined || /\s|[.,!?;:()[\]{}"'`~@#$%^&*+=\\/<>|-]/.test(char);

  const shouldCreateWordCheckpoint = (prev: string, next: string) => {
    if (prev === next) return false;
    const prevLast = prev.at(-1);
    const nextLast = next.at(-1);

    if (next.length > prev.length) {
      // Start of a new word (e.g., from empty/space/punctuation to first letter)
      return isWordBoundaryChar(prevLast) && !isWordBoundaryChar(nextLast);
    }

    if (next.length < prev.length) {
      // Deleting across a word boundary
      return isWordBoundaryChar(nextLast) !== isWordBoundaryChar(prevLast);
    }

    return false;
  };

  const applyEditorChange = (
    next: DraftHistory,
    options?: { forceCheckpoint?: boolean },
  ) => {
    if (next.title === noteTitle && next.body === noteBody) return;

    const titleChanged = next.title !== noteTitle;
    const bodyChanged = next.body !== noteBody;
    const shouldCheckpoint =
      options?.forceCheckpoint ||
      (titleChanged && !bodyChanged
        ? shouldCreateWordCheckpoint(noteTitle, next.title)
        : bodyChanged && !titleChanged
          ? shouldCreateWordCheckpoint(noteBody, next.body)
          : true);

    if (shouldCheckpoint) {
      setEditorUndoStack((prev) =>
        pushHistory(prev, { title: noteTitle, body: noteBody }),
      );
    }
    setEditorRedoStack([]);
    setNoteTitle(next.title);
    setNoteBody(next.body);
  };

  const applyDialogChange = (
    next: DraftHistory,
    options?: { forceCheckpoint?: boolean },
  ) => {
    if (next.title === activeNoteTitle && next.body === activeNoteBody) return;

    const titleChanged = next.title !== activeNoteTitle;
    const bodyChanged = next.body !== activeNoteBody;
    const shouldCheckpoint =
      options?.forceCheckpoint ||
      (titleChanged && !bodyChanged
        ? shouldCreateWordCheckpoint(activeNoteTitle, next.title)
        : bodyChanged && !titleChanged
          ? shouldCreateWordCheckpoint(activeNoteBody, next.body)
          : true);

    if (shouldCheckpoint) {
      setDialogUndoStack((prev) =>
        pushHistory(prev, { title: activeNoteTitle, body: activeNoteBody }),
      );
    }
    setDialogRedoStack([]);
    setActiveNoteTitle(next.title);
    setActiveNoteBody(next.body);
  };

  const handleEditorUndo = () => {
    if (editorUndoStack.length === 0) return;
    const current = { title: noteTitle, body: noteBody };
    const previous = editorUndoStack[editorUndoStack.length - 1];
    setEditorUndoStack((prev) => prev.slice(0, -1));
    setEditorRedoStack((prev) => pushHistory(prev, current));
    setNoteTitle(previous.title);
    setNoteBody(previous.body);
  };

  const handleEditorRedo = () => {
    if (editorRedoStack.length === 0) return;
    const current = { title: noteTitle, body: noteBody };
    const next = editorRedoStack[editorRedoStack.length - 1];
    setEditorRedoStack((prev) => prev.slice(0, -1));
    setEditorUndoStack((prev) => pushHistory(prev, current));
    setNoteTitle(next.title);
    setNoteBody(next.body);
  };

  const handleDialogUndo = () => {
    if (dialogUndoStack.length === 0) return;
    const current = { title: activeNoteTitle, body: activeNoteBody };
    const previous = dialogUndoStack[dialogUndoStack.length - 1];
    setDialogUndoStack((prev) => prev.slice(0, -1));
    setDialogRedoStack((prev) => pushHistory(prev, current));
    setActiveNoteTitle(previous.title);
    setActiveNoteBody(previous.body);
  };

  const handleDialogRedo = () => {
    if (dialogRedoStack.length === 0) return;
    const current = { title: activeNoteTitle, body: activeNoteBody };
    const next = dialogRedoStack[dialogRedoStack.length - 1];
    setDialogRedoStack((prev) => prev.slice(0, -1));
    setDialogUndoStack((prev) => pushHistory(prev, current));
    setActiveNoteTitle(next.title);
    setActiveNoteBody(next.body);
  };

  const handleUpdateNote = () => {
    if (!user || !activeNoteId) return;
    const title = activeNoteTitle.trim();
    const body = activeNoteBody.trim();
    if (!body) {
      setError("Body is required.");
      return;
    }
    const now = Date.now();
    const selectedLabels = getSelectedLabels(activeNoteLabels);
    const nextLabelIds = selectedLabels.map((label) => label.id);
    const nextLabelNames = selectedLabels.map((label) => label.name);
    setNotes((prev) =>
      prev
        .map((note) =>
          note.id === activeNoteId
            ? {
                ...note,
                title,
                body,
                labelIds: nextLabelIds,
                labelNames: nextLabelNames,
                updatedAtMs: now,
              }
            : note,
        )
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs),
    );
    closeNoteDialog();
    enqueueMutations([
      {
        id: newId("mutation"),
        type: "note_upsert",
        note: {
          id: activeNoteId,
          title,
          body,
          labelIds: nextLabelIds,
          labelNames: nextLabelNames,
          updatedAtMs: now,
        },
      },
    ]);
  };

  const handleCopyCardBody = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      setError("Copy failed. Clipboard permission may be blocked.");
    }
  };

  const handlePasteNewNoteBody = async () => {
    try {
      const text = await navigator.clipboard.readText();
      applyEditorChange(
        {
          title: noteTitle,
          body: `${noteBody}${noteBody ? "\n" : ""}${text}`,
        },
        { forceCheckpoint: true },
      );
    } catch {
      setError("Paste failed. Clipboard permission may be blocked.");
    }
  };

  const handlePasteNoteBody = async () => {
    try {
      const text = await navigator.clipboard.readText();
      applyDialogChange(
        {
          title: activeNoteTitle,
          body: `${activeNoteBody}${activeNoteBody ? "\n" : ""}${text}`,
        },
        { forceCheckpoint: true },
      );
    } catch {
      setError("Paste failed. Clipboard permission may be blocked.");
    }
  };

  const toggleId = (current: string[], id: string) =>
    current.includes(id) ? current.filter((x) => x !== id) : [...current, id];

  const openDeleteConfirm = (note: Note) => {
    setPendingDeleteNoteId(note.id);
    setPendingDeleteNoteTitle(note.title);
    setShowDeleteConfirm(true);
  };

  const handleDeleteFromNoteDialog = () => {
    if (!activeNoteId) return;
    const selectedLabels = getSelectedLabels(activeNoteLabels);
    openDeleteConfirm({
      id: activeNoteId,
      title: activeNoteTitle,
      body: activeNoteBody,
      labelIds: selectedLabels.map((label) => label.id),
      labelNames: selectedLabels.map((label) => label.name),
      updatedAtMs: Date.now(),
    });
  };

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setPendingDeleteNoteId("");
    setPendingDeleteNoteTitle("");
  };

  const handleConfirmDeleteNote = () => {
    if (!user || !pendingDeleteNoteId) return;
    setNotes((prev) => prev.filter((note) => note.id !== pendingDeleteNoteId));
    enqueueMutations([
      {
        id: newId("mutation"),
        type: "note_delete",
        noteId: pendingDeleteNoteId,
      },
    ]);
    if (activeNoteId === pendingDeleteNoteId) closeNoteDialog();
    closeDeleteConfirm();
  };

  if (!firebaseReady) {
    return (
      <main className="outer">
        <section className="phone">
          <p className="configError">
            Firebase config missing. Add values to `.env.local` and restart.
          </p>
        </section>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="outer">
        <section className="phone" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="outer">
        <section className="phone">
          <div className="authStack">
            <div className="authBrand">
              <Image
                src="/logo.png"
                alt="VeeNote logo"
                width={34}
                height={34}
                className="authBrandLogo"
                priority
              />
              <span className="authBrandText">VeeNote</span>
            </div>
            <div className="authActions">
              <button
                className="googleButton"
                onClick={handleSignIn}
                type="button"
              >
                <GoogleLogoIcon />
                Sign in with Google
              </button>
              <p>Welcome, enjoy note taking!</p>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (showEditor) {
    return (
      <main className="outer">
        <section
          className={`phone ${showEditorLabelPicker ? "pageOverlayBlur" : ""}`}
        >
          <div className="noteDialogBackdrop" onClick={handleCancelEditor}>
            <form
              className={`noteDialog ${
                showEditorLabelPicker ? "noteDialogLabelPickerOpen" : ""
              }`}
              onSubmit={handleSaveNote}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                className="titleInput"
                name="new_note_title"
                placeholder="Title"
                value={noteTitle}
                onChange={(e) =>
                  applyEditorChange({
                    title: e.target.value,
                    body: noteBody,
                  })
                }
              />
              <div className="editorBodyWrap">
                <textarea
                  className="bodyInput"
                  name="new_note_body"
                  placeholder="Note"
                  value={noteBody}
                  onChange={(e) =>
                    applyEditorChange({
                      title: noteTitle,
                      body: e.target.value,
                    })
                  }
                />
              </div>
              <LabelTriggerGroup
                labelNames={noteLabelNames}
                onOpen={() => setShowEditorLabelPicker(true)}
              />
              <div className="dialogBottomActions">
                <div className="textActionButtons">
                  <button
                    className="pasteIconButton"
                    type="button"
                    onClick={handlePasteNewNoteBody}
                    aria-label="Paste note text"
                    title="Paste text"
                  >
                    <i className="fa-solid fa-paste" aria-hidden="true" />
                  </button>
                </div>
                <div className="editorBottomActions">
                  <button
                    className="historyIconButton"
                    type="button"
                    onClick={handleEditorUndo}
                    aria-label="Undo"
                    title="Undo"
                    disabled={editorUndoStack.length === 0}
                  >
                    <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                  </button>
                  <button
                    className="historyIconButton"
                    type="button"
                    onClick={handleEditorRedo}
                    aria-label="Redo"
                    title="Redo"
                    disabled={editorRedoStack.length === 0}
                  >
                    <i
                      className="fa-solid fa-rotate-right"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    className="cancelButton"
                    type="button"
                    onClick={handleCancelEditor}
                  >
                    Cancel
                  </button>
                  <button className="saveButton" type="submit">
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
          <NoteLabelPickerDialog
            open={showEditorLabelPicker}
            labels={displayedLabels}
            selectedIds={noteLabels}
            namePrefix="new_note_label"
            onToggle={(id) => {
              setNoteLabels((prev) => toggleId(prev, id));
            }}
            onClose={() => setShowEditorLabelPicker(false)}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="outer">
      <section
        className={`phone ${hasMainOverlayOpen ? "pageOverlayBlur" : ""}`}
      >
        <header className="toolbar">
          <input
            ref={searchInputRef}
            className="search"
            type="search"
            name="search_notes"
            placeholder="Search notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="selectButton filterButton"
            type="button"
            onClick={() => setShowFilterPicker(true)}
          >
            <i className="fa-solid fa-filter" aria-hidden="true" />
          </button>
          <button
            className="manageButton"
            onClick={() => setShowLabelManager(true)}
            type="button"
            aria-label="Manage labels"
            title="Manage labels"
          >
            <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
          </button>
        </header>

        {loadingData ? null : visibleNotes.length === 0 ? (
          <div className="phoneEmptyWrap">
            <p className="empty phoneEmpty">No notes found.</p>
          </div>
        ) : (
          <NotesGrid
            visibleNotes={visibleNotes}
            hasMoreNotes={hasMoreNotes}
            loadingMoreNotes={loadingMoreNotes}
            search={search}
            selectedLabel={selectedLabel}
            onOpenNote={openNoteDialog}
            onCopyCardBody={handleCopyCardBody}
            onLoadMoreNotes={() => {
              void handleLoadMoreNotes();
            }}
            onScroll={handleNotesScroll}
          />
        )}

        <button
          className="fab"
          type="button"
          onClick={() => {
            resetNewNoteDraft();
            setShowEditor(true);
          }}
          aria-label="Add note"
          title="Add note"
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
        <button
          className={`signOut ${isNotesListAtTop ? "" : "signOutHidden"}`}
          type="button"
          onClick={handleSignOut}
        >
          <GoogleLogoIcon />
          Sign Out
        </button>
        {showLabelManager && (
          <div
            className="modalBackdrop"
            onClick={() => setShowLabelManager(false)}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <form className="modalRow" onSubmit={handleCreateLabel}>
                <input
                  name="new_label_name"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="New label"
                />
                <button type="submit">Add</button>
              </form>
              <div className="labelList">
                {displayedLabels.map((label) => (
                  <div key={label.id} className="labelItem">
                    <span>{label.name}</span>
                    <button
                      type="button"
                      aria-label="Delete label"
                      title="Delete label"
                      onClick={() => handleDeleteLabel(label.id)}
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showFilterPicker && (
          <div
            className="pickerBackdrop noteLabelPickerBackdrop"
            onClick={() => setShowFilterPicker(false)}
          >
            <div className="pickerDialog" onClick={(e) => e.stopPropagation()}>
              <div className="pickerList">
                <button
                  className={
                    selectedLabel === "all"
                      ? "pickerOptionActive"
                      : "pickerOption"
                  }
                  type="button"
                  onClick={() => {
                    setSelectedLabel("all");
                    setShowFilterPicker(false);
                  }}
                >
                  <span className="pickerLabel">All</span>
                  <span className="pickerCount">{notes.length}</span>
                </button>
                {displayedLabels.map((label) => (
                  <button
                    key={label.id}
                    className={
                      selectedLabel === label.id
                        ? "pickerOptionActive"
                        : "pickerOption"
                    }
                    type="button"
                    onClick={() => {
                      setSelectedLabel(label.id);
                      setShowFilterPicker(false);
                    }}
                  >
                    <span className="pickerLabel">{label.name}</span>
                    <span className="pickerCount">
                      {labelNoteCounts[label.id] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showNoteDialog && (
          <div className="noteDialogBackdrop" onClick={closeNoteDialog}>
            <div
              className={`noteDialog ${
                showNoteLabelPicker ? "noteDialogLabelPickerOpen" : ""
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                className="titleInput"
                name="active_note_title"
                value={activeNoteTitle}
                onChange={(e) =>
                  applyDialogChange({
                    title: e.target.value,
                    body: activeNoteBody,
                  })
                }
                placeholder="Title"
              />
              <div className="editorBodyWrap">
                <textarea
                  className="bodyInput"
                  name="active_note_body"
                  value={activeNoteBody}
                  onChange={(e) =>
                    applyDialogChange({
                      title: activeNoteTitle,
                      body: e.target.value,
                    })
                  }
                  placeholder="Note"
                />
              </div>
              <LabelTriggerGroup
                labelNames={activeNoteLabelNames}
                onOpen={() => setShowNoteLabelPicker(true)}
              />
              <div className="dialogBottomActions">
                <div className="textActionButtons">
                  <button
                    className="noteDialogDeleteButton"
                    type="button"
                    onClick={handleDeleteFromNoteDialog}
                    aria-label="Delete note"
                    title="Delete note"
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" />
                  </button>
                  <button
                    className="pasteIconButton"
                    type="button"
                    onClick={handlePasteNoteBody}
                    aria-label="Paste note text"
                    title="Paste text"
                  >
                    <i className="fa-solid fa-paste" aria-hidden="true" />
                  </button>
                </div>
                <div className="editorBottomActions">
                  <button
                    className="historyIconButton"
                    type="button"
                    onClick={handleDialogUndo}
                    aria-label="Undo"
                    title="Undo"
                    disabled={dialogUndoStack.length === 0}
                  >
                    <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                  </button>
                  <button
                    className="historyIconButton"
                    type="button"
                    onClick={handleDialogRedo}
                    aria-label="Redo"
                    title="Redo"
                    disabled={dialogRedoStack.length === 0}
                  >
                    <i
                      className="fa-solid fa-rotate-right"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    className="cancelButton"
                    type="button"
                    onClick={closeNoteDialog}
                  >
                    Cancel
                  </button>
                  <button
                    className="saveButton"
                    type="button"
                    onClick={handleUpdateNote}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <NoteLabelPickerDialog
          open={showNoteLabelPicker}
          labels={displayedLabels}
          selectedIds={activeNoteLabels}
          namePrefix="active_note_label"
          onToggle={(id) => {
            setActiveNoteLabels((prev) => toggleId(prev, id));
          }}
          onClose={() => setShowNoteLabelPicker(false)}
        />

        {showDeleteConfirm && (
          <div className="confirmBackdrop" onClick={closeDeleteConfirm}>
            <div className="confirmDialog" onClick={(e) => e.stopPropagation()}>
              <h3>Delete note?</h3>
              <p>
                This will permanently remove{" "}
                <strong>{pendingDeleteNoteTitle || "this note"}</strong>.
              </p>
              <div className="confirmActions">
                <button
                  className="cancelButton"
                  type="button"
                  onClick={closeDeleteConfirm}
                >
                  Cancel
                </button>
                <button
                  className="dangerButton"
                  type="button"
                  onClick={handleConfirmDeleteNote}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {error && error !== HIDDEN_SYNC_WARNING && (
          <p className="error">{error}</p>
        )}
      </section>
    </main>
  );
}
