export type Note = {
  id: string;
  title: string;
  content: string;
  positionAt: number;
};

type noteApi = {
  id: string;
  title: string;
  content: string;
  position_at: number;
};
export function parseNote(data: noteApi): Note {
  return {
    id: data.id,
    content: data.content,
    title: data.title,
    positionAt: data.position_at,
  };
}
