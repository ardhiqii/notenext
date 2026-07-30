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

export type User = {
  id: string;
  username: string;
  email: string;
  name: string;
  avatarURL: string | null;
  has_password: boolean;
};
