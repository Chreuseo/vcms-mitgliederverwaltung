import sanitizeHtml, { type IOptions } from "sanitize-html";
import { convert } from "html-to-text";

const SANITIZE_OPTIONS: IOptions = {
  allowedTags: [
    "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "blockquote",
    "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style"],
    p: ["style"],
    div: ["style"],
  },
  allowedStyles: {
    "*": {
      "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }, true),
  },
};

function normalizeSanitizedHtml(html: string): string {
  return html
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .trim();
}

export function sanitizeRundmailHtml(content: string): string {
  return normalizeSanitizedHtml(sanitizeHtml(content, SANITIZE_OPTIONS));
}

export function rundmailHtmlToText(content: string): string {
  const text = convert(content, {
    wordwrap: 100,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  }).trim();

  return text || "(kein Inhalt)";
}

export function rundmailHtmlToPdfText(content: string): string {
  return rundmailHtmlToText(content)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
