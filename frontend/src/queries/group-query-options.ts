import { api } from "@/lib/api";
import { parseTabGroup } from "@/lib/utils";
import { queryKeys } from "@/queries/keys";
import type { TabsWithGroups } from "@/types";
import { queryOptions } from "@tanstack/react-query";

const getGroupsWithTabs = queryOptions<TabsWithGroups>({
  queryKey: queryKeys.tabGroups.withTabs,
  queryFn: async () => {
    const resp: any = await api.get("/groups");
    const data = resp.data ?? resp;
    return {
      groups: (data.groups || []).map(parseTabGroup),
      ungroupedTabs: (data.ungrouped_tabs || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        content: t.content ?? "",
        positionAt: t.position_at ?? t.positionAt,
        groupId: t.group_id ?? null,
      })),
    };
  },
  staleTime: 0,
});

export const GroupQueryOptions = {
  getGroupsWithTabs,
};
