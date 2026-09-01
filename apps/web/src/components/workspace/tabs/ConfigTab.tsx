import Editor from "@monaco-editor/react";

export function ConfigTab({ challenge }: { challenge: any }) {
  return (
    <div className="flex-1 border border-panel-border rounded-lg overflow-hidden min-h-[280px]">
      <Editor
        height="100%"
        language={challenge.editorLanguage || "plaintext"}
        theme="vs-dark"
        value={challenge.templateCode || "# No template available"}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 11,
          lineNumbers: "on",
          fontFamily: "var(--font-mono)",
          scrollbar: { vertical: "auto", horizontal: "auto" },
          padding: { top: 10, bottom: 10 },
        }}
      />
    </div>
  );
}
