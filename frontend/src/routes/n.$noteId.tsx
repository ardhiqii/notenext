import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/n/$noteId")({
  component: NoteComponent,
});

function NoteComponent() {
  const noteId = Route.useParams().noteId;

  return (
    <div className="">
      <h1>HELLO</h1>
    </div>
  );
}
