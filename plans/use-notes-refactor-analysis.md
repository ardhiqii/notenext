# use-notes.ts Refactor Analysis

## Current Problems

### 1. Single File Doing Too Much (240+ lines)

**Problem:** `use-notes.ts` contains:
- 2 queries (tabs, currentNote)
- 1 state (currentNoteId)
- 4 mutations (create, delete, update, rename)
- 1 effect (initial tab selection)
- Prefetch logic for adjacent tabs

**Why It's Bad:**
- Hard to test individual features
- Hard to reuse (can't use just one mutation elsewhere)
- Adding new features bloats the file
- Mixed concerns (state + queries + mutations)

---

### 2. Local State for Global Concern

**Problem:** `currentNoteId` is local state inside `useNotes` hook.

```typescript
const [currentNoteId, setCurrentNoteId] = useState<string>("");
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Coupling** | Mutations must be in same hook to update state |
| **Prop drilling** | State must be passed through `useNotes()` return |
| **Can't access independently** | Other hooks can't read/write `currentNoteId` |
| **No persistence** | State lost on unmount (if hook unmounts) |

**Where currentNoteId is needed:**
- `App.tsx` - pass to TabsBar, render NoteEditor
- `TabsBar` - highlight active tab
- `NoteEditor` - fetch note content
- `createNoteMutation` - set to new note
- `deleteNoteMutation` - set to next/prev note
- Modals - know which note is active

---

### 3. Mutations Tightly Coupled to State

**Problem:** Mutations directly update `currentNoteId` state:

```typescript
// In createNoteMutation
setCurrentNoteId(optimisticNote.id);

// In deleteNoteMutation
setCurrentNoteId(prevTabs[nextIdx].id);
```

**Why It's Bad:**
- Mutations can't exist outside `useNotes` hook
- Can't test mutations independently
- Adding new mutations requires modifying existing file
- Violates single responsibility principle

---

### 4. No Separation of Concerns

**Problem:** Queries, state, and mutations all mixed together.

**Why It's Bad:**
| Concern | Should Be |
|---------|-----------|
| State management | Global store (Zustand) |
| Data fetching | Separate query hooks |
| Data mutations | Separate mutation hooks |

---

## Solution Summary

### Architecture Changes

```
Before (Current):
┌─────────────────────────────────────┐
│           use-notes.ts              │
│  ┌─────────────────────────────┐   │
│  │ useState (currentNoteId)    │   │
│  ├─────────────────────────────┤   │
│  │ useQuery (tabs)             │   │
│  │ useQuery (currentNote)      │   │
│  ├─────────────────────────────┤   │
│  │ useMutation (create)        │   │
│  │ useMutation (delete)        │   │
│  │ useMutation (update)        │   │
│  │ useMutation (rename)        │   │
│  ├─────────────────────────────┤   │
│  │ useEffect (init)            │   │
│  │ useQueries (prefetch)       │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘

After (Proposed):
┌─────────────────────────────────────────────────┐
│         use-current-note-store.ts               │
│         (Zustand - global state)                │
│         currentNoteId, setCurrentNoteId         │
└─────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────────────┐
│  use-tabs.ts    │  │  use-current-note.ts    │
│  (Query only)   │  │  (Query, reads store)   │
└─────────────────┘  └─────────────────────────┘
         │                    │
         └────────┬───────────┘
                  ▼
┌─────────────────────────────────────────────────┐
│          use-note-mutations.ts                  │
│          (Mutations, updates store)             │
│          create, delete, update, rename         │
└─────────────────────────────────────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
┌─────────────────┐ ┌─────────────────┐
│use-export-notes │ │use-import-notes │
│(New feature)    │ │(New feature)    │
└─────────────────┘ └─────────────────┘
```

---

## Key Principles

1. **State in Zustand Store** - Decoupled, accessible anywhere
2. **Queries are pure** - Only fetch data, read from store
3. **Mutations are pure** - Only mutate data, update store
4. **Composite hook for convenience** - Optional backward compatibility

---

## Benefits After Refactor

| Aspect | Before | After |
|--------|--------|-------|
| **File size** | 240+ lines in one file | ~40-80 lines per file |
| **Testability** | Must test all together | Test each hook independently |
| **Reusability** | Can't use mutations alone | Import only what you need |
| **Adding features** | Bloat existing file | New file, new hook |
| **State access** | Only via useNotes() | Anywhere via store |
| **Coupling** | High (state + queries + mutations) | Low (single responsibility) |
