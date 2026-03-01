# Frontend Refactor Implementation Plan

## Overview

This plan addresses all issues identified in `frontend-code-analysis.md` with specific implementation steps, following [Vercel React Best Practices](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices).

---

## Phase 1: NoteEditor.tsx Refactor (High Priority)

### 1.1 Remove Redundant State

**Vercel Rule:** `5.1 - Calculate Derived State During Rendering`

**Current (Incorrect):**
```typescript
const [note, setNote] = useState<Note | null>(null);

useEffect(() => {
  if (!currentNote) return;
  setNote(currentNote);
}, [currentNote?.id]);
```

**After (Correct):**
```typescript
// Remove note state entirely, use currentNote directly
// Use useRef for values needed in cleanup
const currentNoteRef = useRef(currentNote);

useEffect(() => {
  currentNoteRef.current = currentNote;
}, [currentNote]);
```

---

### 1.2 Fix useEffect Dependencies

**Vercel Rules:** 
- `5.6 - Narrow Effect Dependencies`
- `5.12 - Use useRef for Transient Values`
- `8.3 - useEffectEvent for Stable Callback Refs`

**Current (Incorrect):**
```typescript
useEffect(() => {
  // ... uses currentNote, updateContentNote
}, [currentNote?.id, note]);  // Missing deps
```

**After (Correct):**
```typescript
// Use refs for values needed in cleanup (Rule 5.12, 8.3)
const currentNoteRef = useRef(currentNote);
const updateContentNoteRef = useRef(updateContentNote);

// Keep refs in sync without triggering effect re-runs
useEffect(() => {
  currentNoteRef.current = currentNote;
}, [currentNote]);

useEffect(() => {
  updateContentNoteRef.current = updateContentNote;
}, [updateContentNote]);

// Effect only depends on note ID (Rule 5.6)
useEffect(() => {
  // ... WebSocket setup
}, [currentNote?.id]); // Only re-run on note change
```

---

### 1.3 Consolidate Save Logic

**Vercel Rule:** `5.7 - Put Interaction Logic in Event Handlers`

**Current (Incorrect):** 3 different save triggers causing race conditions

**After (Correct):** Single save function with proper timing
```typescript
// Single source of truth for saving
const saveContent = useCallback((content: string) => {
  if (!currentNoteRef.current) return;
  updateContentNoteRef.current({
    ...currentNoteRef.current,
    content,
  });
}, []);

// Debounced save for typing
const debouncedSave = useDebouncedCallback(saveContent, 300);

// WebSocket observer - single trigger point
ytext.observe(() => {
  debouncedSave(ytext.toString());
});

// Cleanup - flush pending saves, don't trigger new save
return () => {
  debouncedSave.flush(); // Ensure pending saves complete
  // cleanup WebSocket
};
```

---

### 1.4 Extract WebSocket Logic to Custom Hook

**Vercel Rule:** `8.1 - Initialize App Once, Not Per Mount` (applies to WebSocket per note)

**New File:** `hooks/use-yjs-websocket.ts`

```typescript
interface UseYjsWebSocketOptions {
  noteId: string;
  initialContent: string;
  onSave: (content: string) => void;
  onConnectionChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

export const useYjsWebSocket = (options: UseYjsWebSocketOptions) => {
  const { noteId, initialContent, onSave, onConnectionChange } = options;
  
  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);
  const [clientCount, setClientCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  
  // Store onSave in ref to avoid effect re-runs (Rule 8.2)
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  
  useEffect(() => {
    // Setup WebSocket
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("codemirror");
    const wsProvider = new WebsocketProvider(/* ... */);
    
    // Store refs
    ydocRef.current = ydoc;
    ytextRef.current = ytext;
    wsProviderRef.current = wsProvider;
    
    // Connection status
    wsProvider.on("status", (e) => {
      setIsConnected(e.status === "connected");
      onConnectionChange?.(e.status);
    });
    
    return () => {
      // Cleanup
      wsProvider.disconnect();
      wsProvider.destroy();
      ydoc.destroy();
    };
  }, [noteId]); // Only depend on noteId (Rule 5.6)
  
  return {
    ytext: ytextRef.current,
    isConnected,
    clientCount,
  };
};
```

---

### 1.5 Fix User Color Consistency

**Current (Incorrect):**
```typescript
const USER_COLOR = CURSOR_COLORS[random.uint32() % CURSOR_COLORS.length];
```

**After (Correct):** Store in sessionStorage for consistency within session
```typescript
const getUserColor = () => {
  const stored = sessionStorage.getItem('user-color');
  if (stored) return stored;
  
  const color = CURSOR_COLORS[random.uint32() % CURSOR_COLORS.length].color;
  sessionStorage.setItem('user-color', color);
  return color;
};

// Usage in component
const userColor = useMemo(() => getUserColor(), []);
```

---

### 1.6 Complete Refactored NoteEditor

**Following Vercel Rules:** `5.1`, `5.6`, `5.7`, `5.12`, `8.2`, `8.3`

```typescript
interface NoteEditorProps {
  currentNote: Note | null;
}

const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const { openModal, closeModal } = useModal();
  const { updateContentNote } = useNoteMutations();
  
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  
  // Rule 5.12: Use refs for transient values used in cleanup
  const currentNoteRef = useRef(currentNote);
  const updateContentNoteRef = useRef(updateContentNote);
  
  // Keep refs in sync
  useEffect(() => {
    currentNoteRef.current = currentNote;
  }, [currentNote]);
  
  useEffect(() => {
    updateContentNoteRef.current = updateContentNote;
  }, [updateContentNote]);
  
  // Rule 5.7: Save logic in event handler, not effect
  const saveContent = useCallback((content: string) => {
    if (!currentNoteRef.current) return;
    updateContentNoteRef.current({
      ...currentNoteRef.current,
      content,
    });
  }, []);
  
  const debouncedSave = useDebouncedCallback(saveContent, 300);
  
  // Rule 5.6: Narrow dependencies to just note ID
  useEffect(() => {
    if (!currentNote || !editorRef.current) return;
    
    openModal("connection-note");
    
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("codemirror");
    const wsProvider = new WebsocketProvider(
      WS_BASE_URL,
      `${currentNote.id}/ws`,
      ydoc,
    );
    
    // Setup editor...
    
    // Single save trigger point
    ytext.observe(() => {
      debouncedSave(ytext.toString());
    });
    
    wsProvider.on("status", (e) => {
      if (e.status === "connected") closeModal();
    });
    
    return () => {
      debouncedSave.flush(); // Flush pending, don't trigger new
      wsProvider.disconnect();
      ydoc.destroy();
      viewRef.current?.destroy();
    };
  }, [currentNote?.id]); // Only depend on note ID
  
  return <div ref={editorRef} className="h-full" />;
};
```

---

## Phase 2: use-notes.ts Refactor (Already Planned)

**See `use-notes-refactor-plan.md` for full implementation.**

**Vercel Rules Applied:**
- `5.9 - Use Functional setState Updates` - For mutation callbacks
- `5.12 - Use useRef for Transient Values` - For currentNoteId in mutations

**Quick Summary:**
1. Create `use-current-note-store.ts` (Zustand)
2. Create `use-tabs.ts` (Query)
3. Create `use-current-note.ts` (Query)
4. Create `use-note-mutations.ts` (Mutations)
5. Create `use-export-notes.ts` (Mutations)
6. Create `use-import-notes.ts` (Mutation)
7. Refactor `use-notes.ts` to composite

---

## Phase 3: Local Storage Integration

**Vercel Rule:** `4.4 - Version and Minimize localStorage Data`

### 3.1 Use Zustand Persist with Versioning

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CurrentNoteStore {
  currentNoteId: string;
  setCurrentNoteId: (id: string) => void;
}

const STORAGE_VERSION = 1;

export const useCurrentNoteStore = create<CurrentNoteStore>()(
  persist(
    (set) => ({
      currentNoteId: "",
      setCurrentNoteId: (id) => set({ currentNoteId: id }),
    }),
    {
      name: "notenext-current-note",
      version: STORAGE_VERSION,
    }
  )
);
```

**Then remove:** `lib/local-storage.ts` and `constants/index.ts` (or keep for other uses)

---

## Phase 4: SyncIndicator Fix

**Vercel Rule:** `5.12 - Use useRef for Transient Values`

### 4.1 Connect to TanStack Query State

```typescript
import { useNoteMutations } from "@/hooks/use-note-mutations";

const SyncIndicator = () => {
  const { createNote, updateNoteContent, renameNote } = useNoteMutations();
  
  // Derived state from actual mutations
  const isSyncing = 
    createNote.isPending || 
    updateNoteContent.isPending || 
    renameNote.isPending;
  
  const hasError = 
    createNote.isError || 
    updateNoteContent.isError || 
    renameNote.isError;

  const getSyncMessage = () => {
    if (hasError) return "Sync failed";
    if (isSyncing) return "Synchronizing...";
    return "Synchronized";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "w-2 h-2 rounded-full",
          hasError && "bg-red-500",
          isSyncing && "bg-yellow-500 animate-pulse",
          !isSyncing && !hasError && "bg-green-500"
        )} />
      </TooltipTrigger>
      <TooltipContent>
        <p>{getSyncMessage()}</p>
      </TooltipContent>
    </Tooltip>
  );
};
```

---

## Phase 5: Tab.tsx - Remove Effect for Prop Sync

**Vercel Rule:** `5.1 - Calculate Derived State During Rendering`

### 5.1 Use Reset Function Instead of Effect

**Current (Incorrect):**
```typescript
const [editedName, setEditedName] = useState(tab.title);

useEffect(() => {
  if (!isEditing) {
    setEditedName(tab.title);
  }
}, [tab.title, isEditing]);
```

**After (Correct):**
```typescript
const [editedName, setEditedName] = useState(tab.title);
const [isEditing, setIsEditing] = useState(false);

// Reset on exit edit mode - no effect needed
const handleBlur = () => {
  setIsEditing(false);
  const trimmedName = editedName.trim();
  if (trimmedName && trimmedName !== tab.title) {
    renameNote(tab.id, trimmedName);
  } else {
    setEditedName(tab.title); // Reset to original
  }
};

const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Enter") {
    e.currentTarget.blur();
  } else if (e.key === "Escape") {
    setEditedName(tab.title); // Reset
    setIsEditing(false);
  }
};
```

---

## Phase 6: Error Boundaries

### 6.1 Create Error Boundary Component

**New File:** `components/error-boundary.tsx`

```typescript
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <h2>Something went wrong</h2>
            <button onClick={() => window.location.reload()}>
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 6.2 Add to App

```typescript
// main.tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

## Phase 7: Loading States

**Vercel Rule:** `6.2 - CSS content-visibility for Long Lists`

### 7.1 Create Loading Skeleton

**New File:** `components/note-skeleton.tsx`

```typescript
export const NoteSkeleton = () => (
  <div className="h-full animate-pulse">
    <div className="h-11 bg-muted border-b" />
    <div className="p-4 space-y-4">
      <div className="h-4 bg-muted rounded w-1/4" />
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-4 bg-muted rounded w-1/2" />
    </div>
  </div>
);
```

### 7.2 Use in App

```typescript
const { tabs, isLoading } = useTabs();

if (isLoading) return <NoteSkeleton />;
```

---

## Implementation Order

| Phase | Priority | Vercel Rules | Estimated Time |
|-------|----------|--------------|----------------|
| Phase 1: NoteEditor refactor | High | `5.1`, `5.6`, `5.7`, `5.12`, `8.2`, `8.3` | 2-3 hours |
| Phase 2: use-notes refactor | High | `5.9`, `5.12` | 2-3 hours |
| Phase 3: Local storage integration | Medium | `4.4` | 30 min |
| Phase 4: SyncIndicator fix | Low | `5.12` | 30 min |
| Phase 5: Tab.tsx fix | Low | `5.1` | 15 min |
| Phase 6: Error boundaries | Medium | - | 30 min |
| Phase 7: Loading states | Low | `6.2` | 30 min |

---

## Files to Create

| File | Purpose | Vercel Rules Applied |
|------|---------|---------------------|
| `hooks/use-yjs-websocket.ts` | WebSocket connection management | `5.6`, `8.2` |
| `hooks/use-current-note-store.ts` | Zustand store for currentNoteId | `4.4` |
| `hooks/use-tabs.ts` | Tabs query | - |
| `hooks/use-current-note.ts` | Current note query | - |
| `hooks/use-note-mutations.ts` | CRUD mutations | `5.9`, `5.12` |
| `hooks/use-export-notes.ts` | Export mutations | - |
| `hooks/use-import-notes.ts` | Import mutation | - |
| `components/error-boundary.tsx` | Error handling | - |
| `components/note-skeleton.tsx` | Loading UI | - |

## Files to Modify

| File | Changes | Vercel Rules Applied |
|------|---------|---------------------|
| `hooks/use-notes.ts` | Refactor to composite hook | `5.9`, `5.12` |
| `components/note-editor.tsx` | Fix state, effects, save logic | `5.1`, `5.6`, `5.7`, `5.12`, `8.3` |
| `components/sync-indicator.tsx` | Connect to query state | `5.12` |
| `components/tab.tsx` | Remove effect for prop sync | `5.1` |
| `components/modals/search-note-modal.tsx` | Use useQuery | - |
| `components/modals/export-note-modal.tsx` | Use new hooks | - |
| `main.tsx` | Add error boundary | - |

## Files to Remove (Optional)

| File | Reason |
|------|--------|
| `lib/local-storage.ts` | Use Zustand persist instead |
| `constants/index.ts` | No longer needed if using Zustand persist |

---

## Testing Checklist

After implementation:

- [ ] NoteEditor saves content correctly on typing
- [ ] NoteEditor saves on note switch (flush pending saves)
- [ ] NoteEditor saves on tab close
- [ ] No redundant saves (single save trigger)
- [ ] currentNoteId persists on refresh
- [ ] SyncIndicator shows correct state (from actual mutations)
- [ ] Search modal has reactive data
- [ ] Error boundary catches errors
- [ ] Loading skeleton shows while fetching
- [ ] Export/Import works correctly
- [ ] Tab editing resets correctly on cancel (no effect needed)

---

## Vercel Rules Summary

| Rule | Name | Where Applied |
|------|------|---------------|
| `4.4` | Version and Minimize localStorage Data | Phase 3 |
| `5.1` | Calculate Derived State During Rendering | Phase 1.1, Phase 5 |
| `5.6` | Narrow Effect Dependencies | Phase 1.2, Phase 1.4 |
| `5.7` | Put Interaction Logic in Event Handlers | Phase 1.3 |
| `5.9` | Use Functional setState Updates | Phase 2 |
| `5.12` | Use useRef for Transient Values | Phase 1.2, Phase 2, Phase 4 |
| `6.2` | CSS content-visibility for Long Lists | Phase 7 |
| `8.2` | Store Event Handlers in Refs | Phase 1.4 |
| `8.3` | useEffectEvent for Stable Callback Refs | Phase 1.2 |

---

## Skill Development Mapping

Each refactor phase develops specific skills. This mapping shows **what you'll learn** by implementing each change.

### Phase-by-Phase Skill Development

| Phase | Skill Developed | Why This Matters |
|-------|-----------------|------------------|
| **Phase 1.1** | Derived State | Learn when NOT to store state - use props directly, compute during render |
| **Phase 1.2** | Effect Dependencies + Refs | Understand stale closures, when to use refs vs state in effects |
| **Phase 1.3** | Single Source of Truth | Consolidate logic to one place, avoid race conditions |
| **Phase 1.4** | Custom Hooks | Extract logic into reusable hooks, separation of concerns |
| **Phase 1.5** | Session Management | Understand sessionStorage vs global constants |
| **Phase 2** | State Architecture | Global vs local state, Zustand patterns, hook composition |
| **Phase 3** | Data Persistence | localStorage best practices, versioning, error handling |
| **Phase 4** | Reactive Data Sources | Using mutation status instead of fake state |
| **Phase 5** | Event-Driven Resets | Reset in handlers, not effects |
| **Phase 6** | Error Boundaries | Production-ready error handling |
| **Phase 7** | Loading UX | User feedback during async operations |

---

### Before/After Skill Comparison

| Skill | Before Refactor | After Refactor |
|-------|-----------------|----------------|
| **React Rendering** | Stores props in state, double renders | Uses props directly, single render |
| **Effects** | Missing deps, stale closures | Proper deps, refs for cleanup |
| **State Location** | Everything in one hook | Separated queries, mutations, global state |
| **Error Handling** | None | Error boundaries, proper error states |
| **Data Flow** | Multiple save triggers | Single source of truth |
| **Testing Readiness** | Hard to test monolithic hook | Testable individual hooks |

---

### Interview Readiness

After completing this refactor, you can confidently discuss:

| Topic | What You'll Know |
|-------|------------------|
| **"Tell me about useEffect"** | When to use, dependency array, cleanup, stale closures |
| **"When do you use useRef?"** | Cleanup values, transient data, DOM refs, not triggering re-renders |
| **"How do you manage state?"** | Global (Zustand) vs local, server state (TanStack Query) vs UI state |
| **"How do you handle async operations?"** | Single save point, debouncing, mutation status |
| **"How do you handle errors?"** | Error boundaries, fallback UI, error states from mutations |

---

### Common Mistake → Correct Pattern

| Mistake (Your Current Code) | Correct Pattern | Skill Level |
|-----------------------------|-----------------|-------------|
| `const [note, setNote] = useState(currentNote)` | Use `currentNote` directly | Junior |
| `useEffect(() => { ... }, [id])` with stale values | Add refs for cleanup values | Junior → Mid |
| Multiple save triggers | Single save function | Mid |
| 240-line hook | Separated hooks | Mid |
| No tests | Unit + integration tests | Mid |
| No error boundaries | Error handling | Mid |

---

### Learning Validation

**You understand Phase 1 when you can explain:**

1. Why `note` state was redundant
   - Props are already "state" from parent
   - Duplicating causes double renders and stale data

2. Why refs were needed for cleanup
   - Cleanup runs after effect, values might be stale
   - Refs always have latest value without triggering re-run

3. Why save should have one trigger
   - Multiple triggers = race conditions
   - Debounce + flush = consistent saves

**You understand Phase 2 when you can explain:**

1. Why `currentNoteId` should be global
   - Many components need it
   - Mutations need to update it
   - Should persist across navigation

2. Why hooks should be small
   - Single responsibility
   - Easier to test
   - Easier to reuse

---

### Code Review Readiness

After refactor, your code will pass these review questions:

| Review Question | Your Code |
|-----------------|-----------|
| Are all effect dependencies included? | ✅ Yes, or refs used |
| Is state derived when possible? | ✅ Yes, no redundant state |
| Are there race conditions? | ✅ No, single save point |
| Can this be tested? | ✅ Yes, small hooks |
| What happens on error? | ✅ Error boundary catches |
| What happens while loading? | ✅ Skeleton shows |
