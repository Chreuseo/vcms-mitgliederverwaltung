declare module "react-quill-new" {
  import type { ComponentType } from "react";

  export interface ReactQuillProps {
    theme?: string;
    value?: string;
    onChange?: (value: string) => void;
    modules?: unknown;
    formats?: string[];
  }

  const ReactQuill: ComponentType<ReactQuillProps>;
  export default ReactQuill;
}

