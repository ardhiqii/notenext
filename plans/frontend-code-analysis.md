# Frontend Code Analysis - Issues & Anti-Patterns

## Overview

This document analyzes all issues, anti-patterns, and areas for improvement in the NoteNext frontend codebase, cross-referenced with [Vercel React Best Practices](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices).

---

## 1. NoteEditor.tsx - Multiple Critical Issues

### 1.1 Redundant State (Anti-Pattern)

**Vercel Rule:** `5.1 - Calculate Derived State During Rendering`

**Problem:**
```typescript
const NoteEditor = ({ currentNote }: NoteEditorProps) => {
  const [note, setNote] = useState<Note | null>(null);
  
  useEffect(() => {
    if (!currentNote) return;
    setNote(currentNote);
  }, [currentNote?.id]);
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Redundant state** | `currentNote` is already passed as prop, `note` duplicates it |
| **Stale closure risk** | `note` might be stale when used in effects |
| **Race conditions** | `note` updates asynchronously while `currentNote` is immediate |
| **Extra re-renders** | Two state updates for the same data |

**Vercel Best Practice Quote:**
> If a value can be computed from current props/state, do not store it in state or update it in an effect. Derive it during render to avoid extra renders and state drift.

**Solution:** Use `currentNote` directly. If you need local modifications, derive state during render or use refs.

---

### 1.2 useEffect Dependencies Issue (Bug Risk)

**Vercel Rule:** `5.6 - Narrow Effect Dependencies`

**Problem:**
```typescript
useEffect(() => {
  // ... WebSocket setup
  return () => {
    updateContentNote({ ...currentNote, content: ytext.toString() });
    // cleanup
  };
}, [currentNote?.id, note]);  // ⚠️ Missing: currentNote, updateContentNote
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Stale closure** | `currentNote` inside effect is stale if `currentNote` changes |
| **Missing deps** | ESLint warning, potential bugs |
| **Incorrect cleanup** | Might save wrong data on cleanup |

**Vercel Best Practice Quote:**
> Specify primitive dependencies instead of objects to minimize effect re-runs.

**Solution:** Use refs for values that shouldn't trigger re-runs:
```typescript
const currentNoteRef = useRef(currentNote);
useEffect(() => {
  currentNoteRef.current = currentNote;
}, [currentNote]);

useEffect(() => {
  // Use currentNoteRef.current in cleanup
}, [currentNote?.id]); // Only depend on ID
```

---

### 1.3 Multiple Save Triggers (Inconsistent Data Risk)

**Vercel Rule:** `5.7 - Put Interaction Logic in Event Handlers`

**Problem:** Content is saved in 3 different places:
```typescript
// 1. Debounced save on every keystroke
const debounceUpdate = useDebouncedCallback((updatedNote: Note) => {
  if (clients == 1) {
    updateContentNote(updatedNote);
  }
}, 300);

// 2. On client_leave (last client leaving)
if (jsonData.type === "client_leave") {
  updateContentNote({ ...currentNote, content: ytext.toString() });
}

// 3. On cleanup (unmount)
return () => {
  updateContentNote({ ...currentNote, content: ytext.toString() });
};
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Race conditions** | Multiple saves can conflict |
| **Data inconsistency** | Different `currentNote` values used in each save |
| **Over-saving** | Cleanup + client_leave might double save |
| **Hard to debug** | Which save actually persisted? |

**Vercel Best Practice Quote:**
> If a side effect is triggered by a specific user action (submit, click, drag), run it in that event handler. Do not model the action as state + effect.

**Solution:** Consolidate to single save mechanism with refs:
```typescript
const saveContent = useCallback((content: string) => {
  if (!currentNoteRef.current) return;
  updateContentNoteRef.current({ ...currentNoteRef.current, content });
}, []);

const debouncedSave = useDebouncedCallback(saveContent, 300);

// Single save point
ytext.observe(() => debouncedSave(ytext.toString()));

return () => {
  debouncedSave.flush(); // Ensure pending saves complete
};
```

---

### 1.4 Global Mutable Constants

**Problem:**
```typescript
const USER_COLOR = CURSOR_COLORS[random.uint32() % CURSOR_COLORS.length];
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Different color per page load** | Each refresh gives new color |
| **Not per-user** | Same tab = same color, not ideal for collaboration |
| **Should be per-session** | User should have consistent color within session |

**Solution:** Store in sessionStorage for session consistency:
```typescript
const getUserColor = () => {
  const stored = sessionStorage.getItem('user-color');
  if (stored) return stored;
  const color = CURSOR_COLORS[random.uint32() % CURSOR_COLORS.length].color;
  sessionStorage.setItem('user-color', color);
  return color;
};
```

---

### 1.5 Missing useRef for Cleanup Values

**Vercel Rule:** `5.12 - Use useRef for Transient Values` + `8.3 - useEffectEvent for Stable Callback Refs`

**Problem:** Values used in cleanup are stale because they're not in dependencies.

**Solution:**
```typescript
const currentNoteRef = useRef(currentNote);
const updateContentNoteRef = useRef(updateContentNote);

useEffect(() => {
  currentNoteRef.current = currentNote;
  updateContentNoteRef.current = updateContentNote;
});

useEffect(() => {
  // WebSocket setup...
  return () => {
    // Use refs to get latest values
    updateContentNoteRef.current({ 
      ...currentNoteRef.current, 
      content: ytext.toString() 
    });
  };
}, [currentNote?.id]);
```

---

## 2. use-notes.ts - Monolithic Hook

**Vercel Rules:** Multiple rules violated due to coupling

**See `use-notes-refactor-analysis.md` for detailed analysis.**

**Summary:**
| Rule Violated | Description |
|---------------|-------------|
| `5.9 - Use Functional setState Updates` | Could prevent stale closures |
| `5.12 - Use useRef for Transient Values` | currentNoteId is transient |

**Key Issues:**
- 240+ lines doing too much
- Local state for global concern (`currentNoteId`)
- Mutations tightly coupled
- No separation of concerns

---

## 3. Local Storage Not Used (Dead Code)

**Vercel Rule:** `4.4 - Version and Minimize localStorage Data`

**Problem:**
```typescript
// lib/local-storage.ts - EXISTS but NOT USED
export const getStoreNoteId = (): string | null => { ... }
export const setStoreNoteId = (noteId: string | null) => { ... }

// constants/index.ts - EXISTS but NOT USED
export const localStorageKeys = {
  currentNoteId: "currentNoteId"
}
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Dead code** | Written but never called |
| **Lost UX** | User loses selected note on refresh |
| **No versioning** | If used later, no schema versioning |
| **No error handling** | Missing try-catch for private browsing |

**Vercel Best Practice Quote:**
> Add version prefix to keys and store only needed fields. Prevents schema conflicts and accidental storage of sensitive data. Always wrap in try-catch: `getItem()` and `setItem()` throw in incognito/private browsing.

**Solution:**
```typescript
const VERSION = 'v1';

function saveCurrentNoteId(noteId: string) {
  try {
    localStorage.setItem(`currentNoteId:${VERSION}`, noteId);
  } catch {
    // Private browsing or quota exceeded
  }
}
```

---

## 4. SyncIndicator.tsx - Dead State (Unused Variables)

**Vercel Rule:** `5.12 - Use useRef for Transient Values`

**Problem:**
```typescript
const SyncIndicator = () => {
  const [sync, setSync] = useState(false);        // setSync barely used
  const [conflict, _] = useState(false);          // _ = unused setter
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Unused state setters** | `setSync` only called in onClick, `conflict` never changes |
| **Component doesn't sync** | Named "SyncIndicator" but doesn't actually sync |
| **Fake state** | Always shows "Synchronized" even when not |

**Vercel Best Practice Quote:**
> When a value changes frequently and you don't want a re-render on every update, store it in `useRef` instead of `useState`. Keep component state for UI; use refs for temporary DOM-adjacent values.

**Solution:** Connect to TanStack Query mutation state:
```typescript
const { createNote, updateNoteContent, renameNote } = useNoteMutations();

const isSyncing = createNote.isPending || updateNoteContent.isPending || renameNote.isPending;
const hasError = createNote.isError || updateNoteContent.isError || renameNote.isError;
```

---

## 5. search-note-modal.tsx - Direct QueryClient Access

**Problem:**
```typescript
const SearchNoteModal = () => {
  const queryClient = useQueryClient();
  const tabs = queryClient.getQueryData<Note[]>(queryKeys.notes.tabs);
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **No reactivity** | `getQueryData` doesn't subscribe to changes |
| **Inconsistent pattern** | Other components use `useQuery` |
| **Stale data risk** | Data might be outdated |

**Solution:** Use `useQuery` instead:
```typescript
const { data: tabs = [] } = useQuery({
  queryKey: queryKeys.notes.tabs,
  queryFn: async () => {
    const resp = await api.get("/notes?only_tabs=true");
    return resp.data.map(parseNote);
  },
});
```

---

## 6. export-note-modal.tsx - Importing useNotes Just for Tabs

**Problem:**
```typescript
const ExportNoteModal = () => {
  const { tabs: notes } = useNotes();  // Gets entire useNotes hook
```

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Over-fetching** | Gets all useNotes returns (tabs, currentNote, mutations, etc.) |
| **Unnecessary re-renders** | Re-renders on any useNotes state change |
| **Coupled** | Can't use modal without entire useNotes hook |

**Solution:** Use dedicated `useTabs` hook after refactor.

---

## 7. Tab.tsx - Effect for Syncing State

**Vercel Rule:** `5.1 - Calculate Derived State During Rendering`

**Problem:**
```typescript
const [editedName, setEditedName] = useState(tab.title);

useEffect(() => {
  if (!isEditing) {
    setEditedName(tab.title);
  }
}, [tab.title, isEditing]);
```

**Why It's Bad:** State drift between `tab.title` and `editedName`.

**Vercel Best Practice Quote:**
> Do not set state in effects solely in response to prop changes; prefer derived values or keyed resets instead.

**Solution:** Use controlled pattern with reset:
```typescript
const [editedName, setEditedName] = useState(tab.title);

// Reset function called when exiting edit mode
const handleBlur = () => {
  setIsEditing(false);
  setEditedName(tab.title); // Reset to original
};
```

---

## 8. App.tsx - Keyboard Shortcuts Recreated on Render

**Problem:**
```typescript
useKeyboardShortcuts([
  { key: "k", ctrlKey: true, callback: () => openModal("search-note", { ... }) },
]);
```

**Minor Issue:** Shortcuts array is recreated on every render.

**Solution:** Memoize or use stable references:
```typescript
const shortcuts = useMemo(() => [
  { key: "k", ctrlKey: true, callback: () => openModal("search-note", { ... }) },
], [openModal]);

useKeyboardShortcuts(shortcuts);
```

---

## 9. Missing Error Boundaries

**Problem:** No error boundaries in the app.

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **App crashes** | Any error crashes entire app |
| **No fallback UI** | User sees white screen |
| **No error reporting** | Errors not logged |

**Solution:** Add error boundary component wrapping the app.

---

## 10. No Loading States

**Problem:** No loading spinners or skeleton UI.

**Why It's Bad:**
| Issue | Description |
|-------|-------------|
| **Flash of content** | UI jumps when data loads |
| **Poor UX** | User doesn't know if app is working |

**Vercel Rule:** `6.2 - CSS content-visibility for Long Lists` could be applied for note lists.

---

## Summary Table with Vercel Rules

| File | Issue | Severity | Vercel Rule Violated |
|------|-------|----------|---------------------|
| `note-editor.tsx` | Redundant state | High | `5.1` Calculate Derived State |
| `note-editor.tsx` | Missing useEffect deps | High | `5.6` Narrow Effect Dependencies |
| `note-editor.tsx` | Multiple save triggers | Medium | `5.7` Put Logic in Event Handlers |
| `note-editor.tsx` | Stale values in cleanup | High | `5.12` UseRef for Transient Values, `8.3` useEffectEvent |
| `use-notes.ts` | Monolithic hook | Medium | Architecture issue |
| `use-notes.ts` | Local state for global concern | Medium | `5.9` Functional setState |
| `local-storage.ts` | Dead code, no versioning | Low | `4.4` Version localStorage Data |
| `sync-indicator.tsx` | Dead state | Low | `5.12` UseRef for Transient Values |
| `search-note-modal.tsx` | Direct QueryClient access | Low | React Query best practice |
| `tab.tsx` | Effect for prop sync | Low | `5.1` Calculate Derived State |
| App-wide | No error boundaries | Medium | React best practice |
| App-wide | No loading states | Low | UX best practice |

---

## Priority Fix Order

1. **Critical (High Priority):** NoteEditor - Rules `5.1`, `5.6`, `5.7`, `5.12`, `8.3`
   - Remove redundant state
   - Fix effect dependencies with refs
   - Consolidate save logic
   
2. **Medium Priority:** use-notes refactor (maintainability)
   - Split into smaller hooks
   - Move currentNoteId to Zustand

3. **Low Priority:** Dead code cleanup, error boundaries, loading states

---

## Vercel Rules Reference

| Rule | Category | Impact |
|------|----------|--------|
| `5.1` | Re-render Optimization | MEDIUM |
| `5.6` | Re-render Optimization | LOW |
| `5.7` | Re-render Optimization | MEDIUM |
| `5.9` | Re-render Optimization | MEDIUM |
| `5.12` | Re-render Optimization | MEDIUM |
| `8.3` | Advanced Patterns | LOW |
| `4.4` | Client-Side Data Fetching | MEDIUM |

---

## Skill Gap Mapping

This section maps each code issue to specific skill gaps, helping you understand **WHY** the code is problematic and **WHAT** you need to learn.

### Issue → Skill Gap → What to Learn

| Issue | Skill Gap | What You Misunderstood | Learning Resource |
|-------|-----------|----------------------|-------------------|
| **1.1 Redundant State** | React Rendering Model | Props ARE state from parent. Duplicating props in local state causes double renders and stale data. | React Docs: "You Might Not Need an Effect" |
| **1.2 Missing Effect Deps** | Effect Lifecycle | Effects re-run when deps change. Using stale values in cleanup causes bugs. Values used but not in deps = stale closures. | React Docs: "Removing Effect Dependencies" |
| **1.3 Multiple Save Triggers** | Single Source of Truth | Spreading save logic across 3 places causes race conditions. Save should have ONE trigger point. | Vercel Rule 5.7: "Put Interaction Logic in Event Handlers" |
| **1.5 useRef for Cleanup** | Ref vs State Purpose | State triggers re-renders, refs don't. Values needed in cleanup shouldn't trigger effect re-runs - use refs. | Vercel Rule 5.12: "Use useRef for Transient Values" |
| **2. Monolithic Hook** | Separation of Concerns | 240 lines in one file is hard to maintain. Queries, mutations, and state should be separate. | Architecture: Single Responsibility Principle |
| **2. Local State for Global** | State Location | `currentNoteId` is needed everywhere - it's global UI state, not local component state. | Zustand docs, Global State Patterns |
| **3. Dead localStorage Code** | Code Maintenance | Writing code "for later" creates confusion. Dead code should be removed or used immediately. | Clean Code principles |
| **4. SyncIndicator Dead State** | Reactive Data Sources | Sync state should come from actual mutation status, not fake local state. | TanStack Query: Mutation Status |
| **7. Effect for Prop Sync** | Derived vs Stored State | When prop changes, don't sync with effect. Reset in event handler or use derived state. | Vercel Rule 5.1: "Calculate Derived State During Rendering" |

---

### Core Knowledge Gaps

| Knowledge Area | Your Current Understanding | What You Need to Learn | Priority |
|----------------|---------------------------|------------------------|----------|
| **React Render Cycle** | Partial | When components re-render, why effects run, render vs commit phase | HIGH |
| **Effect Dependencies** | Weak | Why ESLint warns, what happens with missing deps, stale closures | HIGH |
| **Ref vs State** | Confused | When to use each, refs don't trigger re-renders, refs for cleanup | HIGH |
| **State Location** | Local mindset | Global vs local state, where state should live, prop drilling vs context/store | MEDIUM |
| **Derived State** | Using effects | Computing during render vs storing in state | MEDIUM |
| **Testing** | None | Unit tests, integration tests, testing-library | MEDIUM |
| **Error Handling** | None | Error boundaries, try-catch, fallback UI | LOW |

---

### Mental Model Shifts Needed

#### 1. "I need to store this prop in state to use it"
**WRONG** → Props ARE usable directly. Storing in state causes duplication.

**RIGHT** → Use props directly. If you need to modify, create local copy only when editing.

---

#### 2. "I'll add the dependency later, it works now"
**WRONG** → Missing deps cause stale closures. Bugs appear later in production.

**RIGHT** → Always include all dependencies. Use refs if you don't want re-runs.

---

#### 3. "I need an effect to sync X with Y"
**WRONG** → Effects are for synchronizing with external systems (API, DOM, WebSocket).

**RIGHT** → Compute derived state during render. Reset in event handlers, not effects.

---

#### 4. "I'll write this code for future use"
**WRONG** → Dead code confuses and adds maintenance burden.

**RIGHT** → Write code when you need it. Delete unused code.

---

### Why These Issues Matter for Jobs

| Issue | What Interviewers See | Impact on Hiring |
|-------|----------------------|------------------|
| Redundant state | Doesn't understand React basics | May fail technical screening |
| Missing effect deps | Will cause production bugs | Red flag for senior roles |
| No tests | Code quality concerns | Many companies require tests |
| No error handling | Not production-ready code | May struggle in real projects |
| Dead code | Poor code hygiene | Maintains messy codebases |

---

### Quick Self-Assessment Questions

After learning, you should be able to answer:

1. **Why is `const [note, setNote] = useState(currentNote)` wrong?**
   - Answer: It duplicates prop in state, causes double renders, and can become stale

2. **What happens if you omit a dependency from useEffect?**
   - Answer: Stale closure - effect uses old value, bugs in cleanup

3. **When should you use useRef vs useState?**
   - Answer: useRef for values that don't need re-renders (cleanup, timers, DOM refs). useState for UI state.

4. **Why shouldn't you sync props to state with useEffect?**
   - Answer: Derived state should be computed during render. Effects are for side effects, not state sync.

5. **What's the single source of truth for save operations?**
   - Answer: One function/trigger point. Multiple triggers = race conditions.
