import { api } from "@/lib/api";
import { useActiveGroup } from "@/hooks/use-active-group";
import { parseTabGroup } from "@/lib/utils";
import { queryKeys } from "@/queries";
import type { Note, TabGroupWithTabs, TabsWithGroups } from "@/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

function createGroup() {
  return useMutation<TabGroupWithTabs, Error, { name: string }>({
    mutationFn: async ({ name }) => {
      const resp: any = await api.post("/groups", { name });
      return parseTabGroup(resp.data ?? resp);
    },
    onSuccess: (result, _vars, _onMutateResult, ctx) => {
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return { groups: [result], ungroupedTabs: [] };
          return { ...old, groups: [...old.groups, result] };
        },
      );
    },
    onError: () => {
      toast.error("Failed to create group");
    },
  });
}

type RenameGroupParams = {
  id: string;
  name: string;
};

type RenameGroupContext = {
  prev: TabsWithGroups | undefined;
};

function renameGroup() {
  return useMutation<void, Error, RenameGroupParams, RenameGroupContext>({
    mutationFn: async ({ id, name }) => {
      await api.patch(`/groups/${id}`, { name });
    },
    onMutate: async ({ id, name }, ctx) => {
      await ctx.client.cancelQueries({
        queryKey: queryKeys.tabGroups.withTabs,
      });
      const prev = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            groups: old.groups.map((g) =>
              g.id === id ? { ...g, name } : g,
            ),
          };
        },
      );
      return { prev };
    },
    onError: (_error, _vars, context, ctx) => {
      // Roll back the optimistic rename so the sidebar shows the old name.
      if (context?.prev) {
        ctx.client.setQueryData(queryKeys.tabGroups.withTabs, context.prev);
      }
      toast.error("Failed to rename group");
    },
  });
}

type DeleteGroupContext = {
  prev: TabsWithGroups | undefined;
  prevTabs: Note[] | undefined;
};

function deleteGroup() {
  return useMutation<void, Error, { id: string }, DeleteGroupContext>({
    mutationFn: async ({ id }) => {
      await api.delete(`/groups/${id}`);
    },
    onMutate: async ({ id }, ctx) => {
      await ctx.client.cancelQueries({
        queryKey: queryKeys.tabGroups.withTabs,
      });
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      const prev = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);
      // Capture the group BEFORE removing it from cache, so the flat tabs
      // cache can still be updated with the deleted group's tab ids
      const deletedGroup = prev?.groups.find((g) => g.id === id);
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return old;
          const group = old.groups.find((g) => g.id === id);
          const ungrouped = group?.tabs.map((t) => ({
            ...t,
            groupId: null,
          })) ?? [];
          return {
            groups: old.groups.filter((g) => g.id !== id),
            ungroupedTabs: [...old.ungroupedTabs, ...ungrouped].sort(
              (a, b) => a.positionAt - b.positionAt,
            ),
          };
        },
      );
      // Keep the flat tabs cache in sync so the strip shows fresh membership
      ctx.client.setQueryData<Note[]>(queryKeys.notes.tabs, (old) =>
        old?.map((t) =>
          deletedGroup?.tabs?.some((gt) => gt.id === t.id)
            ? { ...t, groupId: null }
            : t,
        ),
      );
      return { prev, prevTabs };
    },
    onSuccess: (_data, { id }, _onMutateResult, _ctx) => {
      // If the deleted group was the active one, clear it so a new note
      // can't be created with a dead group_id (would 404 silently).
      const { activeGroupId, setActiveGroup } = useActiveGroup.getState();
      if (activeGroupId === id) {
        setActiveGroup(null);
      }
    },
    onError: (_error, _vars, context, ctx) => {
      // Roll back both caches so the group and its tabs come back.
      if (context?.prev) {
        ctx.client.setQueryData(queryKeys.tabGroups.withTabs, context.prev);
      }
      if (context?.prevTabs) {
        ctx.client.setQueryData(queryKeys.notes.tabs, context.prevTabs);
      }
      toast.error("Failed to delete group");
    },
  });
}

type ReorderGroupsContext = {
  prev: TabsWithGroups | undefined;
};

type ReorderGroupsParams = {
  groupIds: string[];
};

function reorderGroups() {
  return useMutation<void, Error, ReorderGroupsParams, ReorderGroupsContext>({
    mutationFn: async ({ groupIds }) => {
      await api.patch("/groups/reorder", { group_ids: groupIds });
    },
    onMutate: async ({ groupIds }, ctx) => {
      await ctx.client.cancelQueries({
        queryKey: queryKeys.tabGroups.withTabs,
      });
      const prev = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return old;
          const groupMap = new Map(old.groups.map((g) => [g.id, g]));
          const reordered = groupIds
            .map((id) => groupMap.get(id))
            .filter(Boolean) as TabGroupWithTabs[];
          return { ...old, groups: reordered };
        },
      );
      return { prev };
    },
    onError: (_error, _vars, context, ctx) => {
      // Roll back the optimistic reorder so the original order is restored.
      if (context?.prev) {
        ctx.client.setQueryData(queryKeys.tabGroups.withTabs, context.prev);
      }
      toast.error("Failed to reorder groups");
    },
  });
}

type AssignTabToGroupContext = {
  prev: TabsWithGroups | undefined;
  prevTabs: Note[] | undefined;
};

type AssignTabToGroupParams = {
  tabId: string;
  groupId: string | null;
};

function assignTabToGroup() {
  return useMutation<void, Error, AssignTabToGroupParams, AssignTabToGroupContext>({
    mutationFn: async ({ tabId, groupId }) => {
      await api.patch(`/tabs/${tabId}/group`, {
        group_id: groupId,
      });
    },
    onMutate: async ({ tabId, groupId }, ctx) => {
      await ctx.client.cancelQueries({
        queryKey: queryKeys.tabGroups.withTabs,
      });
      await ctx.client.cancelQueries({ queryKey: queryKeys.notes.tabs });
      const prev = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );
      const prevTabs = ctx.client.getQueryData<Note[]>(queryKeys.notes.tabs);
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return old;
          let movedTab: Note | null = null;
          const updatedGroups = old.groups.map((g) => {
            const idx = g.tabs.findIndex((t) => t.id === tabId);
            if (idx !== -1) {
              movedTab = { ...g.tabs[idx] };
              return {
                ...g,
                tabs: g.tabs.filter((t) => t.id !== tabId),
              };
            }
            return g;
          });
          const ungroupedIdx = old.ungroupedTabs.findIndex(
            (t) => t.id === tabId,
          );
          if (ungroupedIdx !== -1) {
            movedTab = { ...old.ungroupedTabs[ungroupedIdx] };
          }
          const updatedUngrouped = old.ungroupedTabs.filter(
            (t) => t.id !== tabId,
          );

          if (!movedTab) return old;

          const tabWithGroup = { ...movedTab, groupId };

          if (!groupId) {
            return {
              groups: updatedGroups,
              ungroupedTabs: [...updatedUngrouped, tabWithGroup],
            };
          }
          return {
            groups: updatedGroups.map((g) =>
              g.id === groupId
                ? { ...g, tabs: [...g.tabs, tabWithGroup] }
                : g,
            ),
            ungroupedTabs: updatedUngrouped,
          };
        },
      );
      // Keep the flat tabs cache in sync so the strip shows fresh membership
      ctx.client.setQueryData<Note[]>(queryKeys.notes.tabs, (old) =>
        old?.map((t) => (t.id === tabId ? { ...t, groupId } : t)),
      );
      return { prev, prevTabs };
    },
    onError: (_error, _vars, context, ctx) => {
      // Roll back both caches so the tab returns to its previous group.
      if (context?.prev) {
        ctx.client.setQueryData(queryKeys.tabGroups.withTabs, context.prev);
      }
      if (context?.prevTabs) {
        ctx.client.setQueryData(queryKeys.notes.tabs, context.prevTabs);
      }
      toast.error("Failed to move tab");
    },
  });
}

type ToggleCollapseContext = {
  prev: TabsWithGroups | undefined;
};

function toggleCollapse() {
  return useMutation<
    void,
    Error,
    { id: string; collapsed: boolean },
    ToggleCollapseContext
  >({
    mutationFn: async ({ id, collapsed }) => {
      await api.patch(`/groups/${id}/collapse`, { collapsed });
    },
    onMutate: async ({ id, collapsed }, ctx) => {
      await ctx.client.cancelQueries({
        queryKey: queryKeys.tabGroups.withTabs,
      });
      const prev = ctx.client.getQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
      );
      ctx.client.setQueryData<TabsWithGroups>(
        queryKeys.tabGroups.withTabs,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            groups: old.groups.map((g) =>
              g.id === id ? { ...g, collapsed } : g,
            ),
          };
        },
      );
      return { prev };
    },
    onError: (_error, _vars, context, ctx) => {
      // Roll back the optimistic collapse so the group keeps its old state.
      if (context?.prev) {
        ctx.client.setQueryData(queryKeys.tabGroups.withTabs, context.prev);
      }
      toast.error("Failed to collapse group");
    },
  });
}

export const GroupMutations = {
  createGroup,
  renameGroup,
  deleteGroup,
  reorderGroups,
  assignTabToGroup,
  toggleCollapse,
};
