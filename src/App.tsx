import TabsBar from "@/components/TabsBar";
import NoteEditor from "@/components/NoteEditor";

function App() {
  return (
    <div className="h-screen relative flex flex-col">
      <TabsBar />
      <div className="flex-1">
        <NoteEditor />
      </div>
    </div>
  );
}

export default App;
