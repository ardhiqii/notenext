export type Note = {
  id: string;
  title: string;
  content: string;
  positionAt: number;
};

export type Tabs = {
  tabs: Note[]
  currentNoteId: string
}