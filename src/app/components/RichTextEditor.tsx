"use client";

import "react-quill-new/dist/quill.snow.css";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
}

interface QuillComponentProps {
  theme?: string;
  value: string;
  onChange: (value: string) => void;
  modules?: unknown;
  formats?: string[];
}

const ReactQuill = dynamic(
  () => import("react-quill-new").then((module) => module.default as ComponentType<QuillComponentProps>),
  { ssr: false },
);

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["blockquote", "link"],
    ["clean"],
  ],
};

const formats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "list",
  "align",
  "blockquote",
  "link",
];

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  return (
    <div className="rounded border border-black/10 dark:border-white/20 bg-background text-foreground [&_.ql-container]:min-h-[16rem] [&_.ql-container]:border-0 [&_.ql-editor]:min-h-[16rem] [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-black/10 dark:[&_.ql-toolbar]:border-white/20">
      <ReactQuill theme="snow" value={value} onChange={onChange} modules={modules} formats={formats} />
    </div>
  );
}
