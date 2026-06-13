declare module "sanitize-html" {
  export interface IOptions {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowedStyles?: Record<string, Record<string, RegExp[]>>;
    allowedSchemes?: string[];
    transformTags?: Record<string, unknown>;
  }

  export interface SanitizeHtmlStatic {
    (dirty: string, options?: IOptions): string;
    simpleTransform(tagName: string, attribs?: Record<string, string>, merge?: boolean): unknown;
  }

  const sanitizeHtml: SanitizeHtmlStatic;
  export default sanitizeHtml;
}

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

