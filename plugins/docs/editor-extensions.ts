import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";

export const DocsStarterKit = StarterKit.configure({
  link: false,
  listKeymap: false,
  trailingNode: false,
  underline: false,
});

export const DocsLink = Link.extend({
  addAttributes() {
    const attributes = { ...this.parent?.() };
    delete attributes.title;
    return attributes;
  },
}).configure({ openOnClick: false, autolink: true });
