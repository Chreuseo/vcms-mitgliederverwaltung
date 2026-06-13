declare module "html-to-text" {
  export interface ConvertSelectorOptions {
    hideLinkHrefIfSameAsText?: boolean;
  }

  export interface ConvertOptions {
    wordwrap?: number | false;
    selectors?: Array<{
      selector: string;
      options?: ConvertSelectorOptions;
    }>;
  }

  export function convert(html: string, options?: ConvertOptions): string;
}

