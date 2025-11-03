import { Editor } from "@monaco-editor/react";
import { useState } from "react";

const NoteEditor = () => {
  const [textValue, setTextValue] = useState("");
  return (
    <div className=" bg-zinc-900  h-full ">
      <Editor
        value={textValue}
        onChange={(value) => setTextValue(value || "")}
        theme="vs-dark"
        height={"100%"}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          wordWrap: "on",
          padding: { top: 8 },
          smoothScrolling: true,
          lineNumbersMinChars: 2,
        }}
      />
    </div>
  );
};

export default NoteEditor;
