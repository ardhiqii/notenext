export type Note = {
  id: string;
  title: string;
  content: string;
  positionAt: number;
  groupId?: string | null;
};

export type SearchNoteResult = {
  id: string;
  title: string;
  content_snippet: string;
  position_at: number;
  group_id: string | null;
  group_name: string | null;
};

export type Tabs = {
  tabs: Note[];
  currentNoteId: string;
};

export type User = {
  id: string;
  username: string;
  email: string;
  name: string;
  avatarURL: string | null;
  has_password: boolean;
};

export type TabGroup = {
  id: string;
  name: string;
  positionAt: number;
  collapsed: boolean;
};

export type TabGroupWithTabs = TabGroup & {
  tabs: Note[];
};

export type TabsWithGroups = {
  groups: TabGroupWithTabs[];
  ungroupedTabs: Note[];
};
