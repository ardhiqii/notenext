# use-notes Refactor Implementation Plan

## Overview

Refactor `use-notes.ts` into smaller, single-responsibility hooks using Zustand for global state management.

---

## File Structure After Refactor

```
frontend/src/hooks/
├── use-current-note-store.ts  # Zustand store (currentNoteId state)
├── use-tabs.ts                # Query: tabs list
├── use-current-note.ts        # Query: current note + prefetch
├── use-note-mutations.ts      # Mutations: CRUD operations
├── use-export-notes.ts        # Mutations: export operations
├── use-import-notes.ts        # Mutation: import operation
├── use-modal.ts               # (existing, no changes)
└── use-notes.ts               # Composite hook (convenience, backward compatible)
```

---

## Implementation Steps

### Step 1: Create Zustand Store

**File:** `hooks/use-current-note-store.ts`

```typescript
import { create } from "zustand";

interface CurrentNoteStore {
  currentNoteId: string;
  setCurrentNoteId: (id: string) => void;
}

export const useCurrentNoteStore = create<CurrentNoteStore>((set) => ({
  currentNoteId: "",
  setCurrentNoteId: (id) => set({ currentNoteId: id }),
}));
```

---

### Step 2: Create Tabs Query Hook

**File:** `hooks/use-tabs.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/queries";
import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import type { Note } from "@/types";
import { useCurrentNoteStore } from "./use-current-note-store";

export const useTabs = () => {
  const { data: tabs = [], isSuccess } = useQuery<Note[]>({
    queryKey: queryKeys.notes.tabs,
    queryFn: async () => {
      const resp = await api.get("/notes?only_tabs=true");
      return resp.data.map(parseNote);
    },
  });

  return { tabs, isSuccess };
};
```

---

### Step 3: Create Current Note Query Hook

**File:** `hooks/use-current-note.ts`

```typescript
import { useQuery, useQueries } from "@tanstack/react-query";
import { queryKeys } from "@/queries";
import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import type { Note } from "@/types";
import { useCurrentNoteStore } from "./use-current-note-store";
import { useTabs } from "./use-tabs";

export const useCurrentNote = () => {
  const currentNoteId = useCurrentNoteStore((s) => s.currentNoteId);
  const { tabs } = useTabs();

  const { data: currentNote = null } = useQuery<Note | null>({
    queryKey: queryKeys.notes.noteById(currentNoteId ?? ""),
    queryFn: async () => {
      if (!currentNoteId) return null;
      const resp = await api.get(`/notes/${currentNoteId}`);
      return parseNote(resp.data);
    },
  });

  // Prefetch adjacent tabs
  const currentIndex = tabs.findIndex((t) => t.id === currentNoteId);
  const adjacentTabs = [tabs[currentIndex - 1], tabs[currentIndex + 1]].filter(Boolean);

  useQueries({
    queries: adjacentTabs.map((tab) => ({
      queryKey: queryKeys.notes.noteById(tab.id),
      queryFn: async () => {
        const resp = await api.get(`/notes/${tab.id}`);
        return parseNote(resp.data);
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  return { currentNote };
};
```

---

### Step 4: Create Note Mutations Hook

**File:** `hooks/use-note-mutations.ts`

```typescript
import { useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/queries";
import { api } from "@/lib/api";
import { parseNote } from "@/lib/utils";
import type { Note } from "@/types";
import { v4 as uuid } from "uuid";
import { toast } from "sonner";
import { useCurrentNoteStore } from "./use-current-note-store";

export const useNoteMutations = () => {
  const currentNoteId = useCurrentNoteStore((s) => s.currentNoteId);
  const setCurrentNoteId = useCurrentNoteStore((s) => s.setCurrentNoteId);

  // Create Note
  type CreateNoteContext = {
    prevTabs: Note[] | undefined;
    optimisticNote: Note;
  };

  const createNote = useMutation<Note, Error, void, CreateNoteContext>({
    mutationFn: async () => {
      const resp = await api.post("/notes");
      return parseNote(resp.data);
    },
    onMutate: async (_newNote, ctx) => {
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);

      const optimisticNote: Note = {
        id: `temp-${uuid()}`,
        title: "New note",
        content: "",
        positionAt: Date.now() + 1,
      };
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) => [
        ...old,
        optimisticNote,
      ]);

      setCurrentNoteId(optimisticNote.id);
      return { prevTabs, optimisticNote };
    },
    onSuccess: (result, _vars, onMutateResult, ctx) => {
      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((tab) =>
          tab.id === onMutateResult.optimisticNote.id ? result : tab,
        ),
      );
      setCurrentNoteId(result.id);
    },
    onError: (_error, _variables, onMutateResult) => {
      if (!onMutateResult?.optimisticNote) return;
      const errorNote: Note = {
        ...onMutateResult.optimisticNote,
        title: "[Error create note]",
      };
      // Revert would happen here
    },
  });

  // Delete Note
  type DeleteNoteContext = {
    prevTabs: Note[] | undefined;
    id: string;
  };

  const deleteNote = useMutation<void, Error, string, DeleteNoteContext>({
    mutationFn: async (id: string) => {
      await api.delete(`/notes/${id}`);
    },
    onMutate: async (id, ctx) => {
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);

      if (!prevTabs || prevTabs.length <= 1) return { prevTabs, id };

      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.filter((note) => note.id !== id),
      );

      // Change current note id
      const currentIdx = prevTabs.findIndex((tab) => tab.id === id);
      const nextIdx =
        currentIdx === prevTabs.length - 1 ? currentIdx - 1 : currentIdx + 1;
      setCurrentNoteId(prevTabs[nextIdx].id);

      return { prevTabs, id };
    },
    onError: (_error, _vars, onMutateResult) => {
      if (!onMutateResult?.prevTabs) return;
      toast.warning(`Retrying delete note ${onMutateResult.id}`);
    },
    retry: 5,
  });

  // Update Note Content
  const updateNoteContent = useMutation<void, Error, Note, unknown>({
    mutationFn: async (updateNote) => {
      await api.patch(`/notes/${updateNote.id}`, {
        content: updateNote.content,
      });
    },
    onMutate: async (updateNote, ctx) => {
      await ctx.client.cancelQueries({
        queryKey: queryKeys.notes.noteById(updateNote.id),
      });
      ctx.client.setQueryData(
        queryKeys.notes.noteById(updateNote.id),
        (old: Note) => ({ ...old, content: updateNote.content }),
      );
    },
  });

  // Rename Note
  type RenameNoteParams = { id: string; title: string };

  const renameNote = useMutation<void, Error, RenameNoteParams, unknown>({
    mutationFn: async ({ id, title }) => {
      await api.patch(`/notes/${id}`, { title });
    },
    onMutate: async ({ id, title }, ctx) => {
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      await ctx.client.cancelQueries({
        queryKey: queryKeys.notes.noteById(id),
      });

      ctx.client.setQueryData(queryKeys.notes.tabs, (old: Note[]) =>
        old.map((note) => (note.id === id ? { ...note, title } : note)),
      );

      ctx.client.setQueryData(
        queryKeys.notes.noteById(id),
        (old: Note | undefined) => old && { ...old, title },
      );
    },
    onError: (_error, { title }) => {
      toast.error(`Failed to rename note to "${title}"`);
    },
  });

  return {
    createNote,
    deleteNote,
    updateNoteContent,
    renameNote,
  };
};
```

---

### Step 5: Create Export Notes Hook

**File:** `hooks/use-export-notes.ts`

```typescript
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Note } from "@/types";
import { useCurrentNoteStore } from "./use-current-note-store";

type ExportData = {
  version: string;
  exportedAt: string;
  notes: Note[];
};

const downloadJson = (data: ExportData, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const useExportNotes = () => {
  const currentNoteId = useCurrentNoteStore((s) => s.currentNoteId);

  const exportSingle = async (noteId: string) => {
    const resp = await api.get(`/notes/${noteId}/export`);
    const date = new Date().toISOString().split("T")[0];
    downloadJson(resp.data, `note-export-${date}.json`);
  };

  const exportAll = async () => {
    const resp = await api.get("/notes/export");
    const date = new Date().toISOString().split("T")[0];
    downloadJson(resp.data, `notes-export-${date}.json`);
  };

  const exportSelected = useMutation({
    mutationFn: async (noteIds: string[]) => {
      const resp = await api.post("/notes/export", { noteIds });
      return resp.data as ExportData;
    },
    onSuccess: (data) => {
      const date = new Date().toISOString().split("T")[0];
      downloadJson(data, `notes-export-${date}.json`);
    },
  });

  const exportCurrent = () => {
    if (currentNoteId) {
      exportSingle(currentNoteId);
    }
  };

  return {
    exportSingle,
    exportAll,
    exportSelected,
    exportCurrent,
  };
};
```

---

### Step 6: Create Import Notes Hook

**File:** `hooks/use-import-notes.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/queries";
import { toast } from "sonner";

type ImportNote = {
  title: string;
  content: string;
  positionAt?: number;
};

type ImportResult = {
  imported: number;
  skipped: number;
  noteIds: string[];
};

export const useImportNotes = () => {
  const queryClient = useQueryClient();

  const importNotes = useMutation<ImportResult, Error, ImportNote[]>({
    mutationFn: async (notes) => {
      const resp = await api.post("/notes/import", {
        version: "1.0",
        notes,
      });
      return resp.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.tabs });
      toast.success(`Imported ${result.imported} notes successfully`);
    },
    onError: () => {
      toast.error("Failed to import notes");
    },
  });

  return { importNotes };
};
```

---

### Step 7: Create Composite Hook (Backward Compatible)

**File:** `hooks/use-notes.ts`

```typescript
import { useEffect } from "react";
import { useTabs } from "./use-tabs";
import { useCurrentNote } from "./use-current-note";
import { useNoteMutations } from "./use-note-mutations";
import { useExportNotes } from "./use-export-notes";
import { useImportNotes } from "./use-import-notes";
import { useCurrentNoteStore } from "./use-current-note-store";

export const useNotes = () => {
  const { tabs, isSuccess } = useTabs();
  const { currentNote } = useCurrentNote();
  const { createNote, deleteNote, updateNoteContent, renameNote } =
    useNoteMutations();
  const { exportSingle, exportAll, exportSelected, exportCurrent } =
    useExportNotes();
  const { importNotes } = useImportNotes();

  const currentNoteId = useCurrentNoteStore((s) => s.currentNoteId);
  const setCurrentNoteId = useCurrentNoteStore((s) => s.setCurrentNoteId);

  // Set initial tab on mount
  useEffect(() => {
    if (isSuccess && tabs.length > 0 && !currentNoteId) {
      setCurrentNoteId(tabs[0].id);
    }
  }, [isSuccess, tabs.length, currentNoteId, setCurrentNoteId]);

  return {
    // State
    tabs,
    currentNote,
    currentNoteId,
    setCurrentNoteId,

    // Mutations
    createNewNote: () => createNote.mutate(),
    closeNote: (id: string) => deleteNote.mutate(id),
    updateContentNote: (note: Parameters<typeof updateNoteContent.mutate>[0]) =>
      updateNoteContent.mutate(note),
    renameNote: (id: string, title: string) => renameNote.mutate({ id, title }),

    // Export
    exportSingle,
    exportAll,
    exportSelected,
    exportCurrent,

    // Import
    importNotes,
  };
};
```

---

## Update Query Keys

**File:** `queries/keys.ts`

```typescript
export const queryKeys = {
  notes: {
    all: ["notes"],
    tabs: ["tabs"],
    noteById: (id: string) => [...queryKeys.notes.all, id],
    export: ["notes", "export"],
    import: ["notes", "import"],
  },
};
```

---

## Update Types

**File:** `types/index.ts`

```typescript
export type Note = {
  id: string;
  title: string;
  content: string;
  positionAt: number;
};

export type Tabs = {
  tabs: Note[];
  currentNoteId: string;
};

export type ExportData = {
  version: string;
  exportedAt: string;
  notes: Note[];
};

export type ImportResult = {
  imported: number;
  skipped: number;
  noteIds: string[];
};
```

---

## Update Components

### App.tsx

No changes needed - uses `useNotes()` which remains compatible.

### NoteEditor.tsx

No changes needed - uses `useNotes()` which remains compatible.

### ExportNoteModal.tsx

Update to use new export hooks:

```typescript
const ExportNoteModal = () => {
  const { tabs: notes } = useNotes();
  const { exportSelected, exportCurrent, exportAll } = useExportNotes();
  // ... rest of modal
};
```

---

## Testing Checklist

- [ ] Tabs load correctly
- [ ] Current note displays when tab selected
- [ ] Create note works and selects new note
- [ ] Delete note works and selects adjacent note
- [ ] Update note content works
- [ ] Rename note works
- [ ] Export single note downloads JSON
- [ ] Export all notes downloads JSON
- [ ] Export selected notes downloads JSON
- [ ] Import notes creates new notes
- [ ] `useNotes()` backward compatible with existing components

---

## Implementation Order

1. Create `use-current-note-store.ts`
2. Create `use-tabs.ts`
3. Create `use-current-note.ts`
4. Create `use-note-mutations.ts`
5. Create `use-export-notes.ts`
6. Create `use-import-notes.ts`
7. Refactor `use-notes.ts` to composite
8. Update `queries/keys.ts`
9. Update `types/index.ts`
10. Update components if needed
11. Test all functionality
