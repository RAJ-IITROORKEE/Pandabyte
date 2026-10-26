"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { Extension, type Attributes } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";
import {
  IconArrowBackUp as Undo2,
  IconArrowForwardUp as Redo2,
  IconBold as Bold,
  IconClearFormatting as RemoveFormatting,
  IconCode as Code2,
  IconItalic as Italic,
  IconLink as Link2,
  IconList as List,
  IconListNumbers as ListOrdered,
  IconPhotoPlus as ImagePlus,
  IconStrikethrough as Strikethrough,
  IconUnderline as Underline,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  parseProductRichContent,
  productContentHref,
  PRODUCT_FONT_SIZES,
  PRODUCT_HIGHLIGHTS,
  PRODUCT_TEXT_COLORS,
  type ProductRichContent,
} from "@/lib/admin/product-content";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import styles from "./admin-ui.module.css";
import editorStyles from "./product-rich-text-editor.module.css";

const MAX_INLINE_IMAGES = 30;
const acceptedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

const ManagedImage = Image.extend({
  addAttributes() {
    const attrs: Attributes = { ...(this.parent?.() ?? {}) };
    delete attrs.src;
    delete attrs.title;
    delete attrs.width;
    delete attrs.height;
    return {
      ...attrs,
      mediaId: { default: null, parseHTML: (element: HTMLElement) => element.closest("figure")?.getAttribute("data-media-id") ?? null, rendered: false },
      alt: { default: "", parseHTML: (element: HTMLElement) => element.getAttribute("alt") ?? "" },
      caption: { default: null, parseHTML: (element: HTMLElement) => element.closest("figure")?.querySelector("figcaption")?.textContent ?? null, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-media-id]" }];
  },
  renderHTML({ node }) {
    const mediaId = typeof node.attrs.mediaId === "string" ? node.attrs.mediaId : "";
    const caption = typeof node.attrs.caption === "string" ? node.attrs.caption : "";
    return ["figure", { "data-media-id": mediaId, class: "product-rich-image" },
      ["img", { src: mediaId ? `/api/media/${encodeURIComponent(mediaId)}` : "", alt: String(node.attrs.alt ?? ""), draggable: "false" }],
      ...(caption ? [["figcaption", {}, caption] as const] : []),
    ];
  },
}).configure({ allowBase64: false });

function listDepth(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const { $from } = editor.state.selection;
  let depth = 0;
  for (let index = 0; index <= $from.depth; index += 1) {
    if (["bulletList", "orderedList"].includes($from.node(index).type.name)) depth += 1;
  }
  return depth;
}

const BoundedLists = Extension.create({
  name: "boundedProductLists",
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (!this.editor.isActive("listItem")) return false;
        if (listDepth(this.editor) >= 3) return true;
        return this.editor.commands.sinkListItem("listItem");
      },
      "Shift-Tab": () => this.editor.isActive("listItem") && this.editor.commands.liftListItem("listItem"),
    };
  },
});

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: {
      autolink: false,
      linkOnPaste: false,
      openOnClick: false,
      isAllowedUri: (href) => productContentHref(href),
    },
  }),
  Color,
  Highlight.configure({ multicolor: true }),
  TextStyle,
  FontSize,
  TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
  ManagedImage,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  BoundedLists,
];

function normalizeEditorJson(node: JSONContent): JSONContent {
  const normalized: JSONContent = { ...node };
  if (node.attrs) {
    const attrs = Object.fromEntries(Object.entries(node.attrs).filter(([, value]) => value !== null && value !== undefined));
    if (Object.keys(attrs).length) normalized.attrs = attrs;
    else delete normalized.attrs;
  }
  if (node.marks) normalized.marks = node.marks.map((mark) => {
    if (!mark.attrs) return mark;
    const attrs = Object.fromEntries(Object.entries(mark.attrs).filter(([, value]) => value !== null && value !== undefined));
    return Object.keys(attrs).length ? { ...mark, attrs } : { type: mark.type };
  });
  if (node.content) normalized.content = node.content.map(normalizeEditorJson);
  return normalized;
}

function Button({ active, label, onClick, children, disabled = false }: { active?: boolean; label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return <button aria-label={label} aria-pressed={active} className={`${editorStyles.toolButton} ${active ? editorStyles.toolButtonActive : ""}`} disabled={disabled} onClick={onClick} title={label} type="button">{children}</button>;
}

function countInlineImages(content: JSONContent | undefined) {
  let count = 0;
  const nodes = [...(content?.content ?? [])];
  while (nodes.length) {
    const node = nodes.pop()!;
    if (node.type === "image") count += 1;
    if (node.content) nodes.push(...node.content);
  }
  return count;
}

type UploadResponse = { media?: { id?: string; mimeType?: string } };
type ApiProblem = { error?: { message?: string } };

async function uploadProductImage(file: File, altText: string) {
  const data = new FormData();
  data.append("file", file);
  data.append("altText", altText);
  data.append("source", "");
  const response = await fetch("/api/admin/media", { method: "POST", cache: "no-store", body: data });
  const result = await response.json().catch(() => null) as UploadResponse | ApiProblem | null;
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result ? result.error?.message : undefined;
    throw new Error(message || "The image could not be uploaded. Try again.");
  }
  const id = result && typeof result === "object" && "media" in result ? result.media?.id : undefined;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("The image upload response was incomplete. Refresh the page before retrying.");
  }
  return id;
}

export function ProductRichTextEditor({ value, onChange, onValidityChange, onUploadDelta }: { value: ProductRichContent; onChange: (next: ProductRichContent) => void; onValidityChange: (valid: boolean) => void; onUploadDelta: (change: 1 | -1) => void }) {
  const capabilities = useAdminCapabilities();
  const canManageMedia = capabilities.includes("media.manage");
  const fileId = useId();
  const altId = useId();
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [revision, setRevision] = useState(0);
  const invalidContent = useRef(false);
  const lastSyncedValue = useRef(JSON.stringify(value));
  const editor = useEditor({
    extensions: editorExtensions,
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "Product description editor",
        "aria-multiline": "true",
        class: "product-rich-editor",
        role: "textbox",
      },
    },
    onUpdate({ editor: current }) {
      const parsed = parseProductRichContent(normalizeEditorJson(current.getJSON()));
      if (!parsed) {
        invalidContent.current = true;
        setEditorError("This description exceeds supported content or formatting limits. Simplify it before saving.");
        onValidityChange(false);
        setRevision((currentRevision) => currentRevision + 1);
        return;
      }
      invalidContent.current = false;
      setEditorError("");
      onValidityChange(true);
      lastSyncedValue.current = JSON.stringify(parsed);
      onChange(parsed);
      setRevision((currentRevision) => currentRevision + 1);
    },
  });
  const valueJson = JSON.stringify(value);
  useEffect(() => {
    if (!editor || invalidContent.current || valueJson === lastSyncedValue.current) return;
    if (JSON.stringify(editor.getJSON()) !== valueJson) editor.commands.setContent(value, { emitUpdate: false });
    lastSyncedValue.current = valueJson;
  }, [editor, value, valueJson]);
  const imageCount = editor ? countInlineImages(editor.getJSON()) : 0;
  const selectedImage = editor?.isActive("image") ? editor.getAttributes("image") : null;
  void revision;

  async function insertImage() {
    if (!editor || !imageFile || !imageAlt.trim() || !canManageMedia) return;
    if (!acceptedImageTypes.has(imageFile.type)) {
      setUploadError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (imageCount >= MAX_INLINE_IMAGES) {
      setUploadError(`A product description can contain at most ${MAX_INLINE_IMAGES} images.`);
      return;
    }
    setUploadingImage(true);
    setUploadError("");
    onUploadDelta(1);
    try {
      const mediaId = await uploadProductImage(imageFile, imageAlt.trim());
      editor.chain().focus().insertContent({ type: "image", attrs: { mediaId, alt: imageAlt.trim(), caption: null } }).run();
      toast.success("Product image uploaded.");
      setImageFile(null);
      setImageAlt("");
      if (imageFileRef.current) imageFileRef.current.value = "";
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The image could not be uploaded.";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploadingImage(false);
      onUploadDelta(-1);
    }
  }

  function setLink() {
    if (!editor) return;
    const current = editor.getAttributes("link").href as string | undefined;
    const value = window.prompt("Use an HTTPS URL or a site path.", current ?? "https://");
    if (value === null) return;
    if (!value.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!productContentHref(value.trim())) {
      setEditorError("Use an HTTPS URL or a site path without credentials.");
      return;
    }
    setEditorError("");
    editor.chain().focus().setLink({ href: value.trim() }).run();
  }

  if (!editor) return <section className={`${styles.panel} ${editorStyles.panel}`} aria-label="Product description"><p className={styles.loadingState} role="status">Loading description editor…</p></section>;

  return <section className={`${styles.panel} ${editorStyles.panel}`} aria-label="Product description">
    <div className={styles.sectionHeading}><div><h2>Product description</h2><p>Format the description and add managed images, tables, and code samples.</p></div></div>
    <div aria-label="Product description formatting" className={editorStyles.toolbar} role="group">
      <select aria-label="Block style" className={styles.input} defaultValue="paragraph" onChange={(event) => {
        if (event.target.value === "paragraph") editor.chain().focus().setParagraph().run();
        else editor.chain().focus().toggleHeading({ level: Number(event.target.value) as 2 | 3 | 4 }).run();
      }}>
        <option value="paragraph">Paragraph</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option>
      </select>
      <Button active={editor.isActive("bold")} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><Bold aria-hidden size={16} stroke={1.7} /></Button>
      <Button active={editor.isActive("italic")} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic aria-hidden size={16} stroke={1.7} /></Button>
      <Button active={editor.isActive("underline")} label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline aria-hidden size={16} stroke={1.7} /></Button>
      <Button active={editor.isActive("strike")} label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough aria-hidden size={16} stroke={1.7} /></Button>
      <Button active={editor.isActive("code")} label="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}><Code2 aria-hidden size={16} stroke={1.7} /></Button>
      <select aria-label="Font size" className={styles.input} defaultValue="" onChange={(event) => event.target.value ? editor.chain().focus().setFontSize(event.target.value).run() : editor.chain().focus().unsetFontSize().run()}>
        <option value="">Size</option>{PRODUCT_FONT_SIZES.map((size) => <option key={size} value={size}>{size.replace("px", "")} px</option>)}
      </select>
      <select aria-label="Text color" className={styles.input} defaultValue="" onChange={(event) => event.target.value ? editor.chain().focus().setColor(event.target.value).run() : editor.chain().focus().unsetColor().run()}>
        <option value="">Text color</option>{PRODUCT_TEXT_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
      </select>
      <select aria-label="Highlight color" className={styles.input} defaultValue="" onChange={(event) => event.target.value ? editor.chain().focus().setHighlight({ color: event.target.value }).run() : editor.chain().focus().unsetHighlight().run()}>
        <option value="">Highlight</option>{PRODUCT_HIGHLIGHTS.map((color) => <option key={color} value={color}>{color}</option>)}
      </select>
      <select aria-label="Text alignment" className={styles.input} defaultValue="left" onChange={(event) => editor.chain().focus().setTextAlign(event.target.value).run()}>
        <option value="left">Align left</option><option value="center">Align center</option><option value="right">Align right</option>
      </select>
      <Button active={editor.isActive("bulletList")} label="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List aria-hidden size={16} stroke={1.7} /></Button>
      <Button active={editor.isActive("orderedList")} label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered aria-hidden size={16} stroke={1.7} /></Button>
      <Button label="Indent list item" disabled={!editor.isActive("listItem") || listDepth(editor) >= 3 || !editor.can().sinkListItem("listItem")} onClick={() => editor.chain().focus().sinkListItem("listItem").run()}>Tab+</Button>
      <Button label="Outdent list item" disabled={!editor.isActive("listItem") || !editor.can().liftListItem("listItem")} onClick={() => editor.chain().focus().liftListItem("listItem").run()}>Tab−</Button>
      <Button active={editor.isActive("blockquote")} label="Block quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</Button>
      <Button active={editor.isActive("codeBlock")} label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code</Button>
      <Button label="Insert divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>Divider</Button>
      <Button active={editor.isActive("link")} label="Add or edit link" onClick={setLink}><Link2 aria-hidden size={16} stroke={1.7} /></Button>
      <Button label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting aria-hidden size={16} stroke={1.7} /></Button>
      <Button label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}>Table</Button>
      <Button label="Add table row" disabled={!editor.isActive("table")} onClick={() => editor.chain().focus().addRowAfter().run()}>Row+</Button>
      <Button label="Add table column" disabled={!editor.isActive("table")} onClick={() => editor.chain().focus().addColumnAfter().run()}>Column+</Button>
      <Button label="Remove table" disabled={!editor.isActive("table")} onClick={() => editor.chain().focus().deleteTable().run()}>Table−</Button>
      <Button label="Choose image" disabled={!canManageMedia || imageCount >= MAX_INLINE_IMAGES} onClick={() => imageFileRef.current?.click()}><ImagePlus aria-hidden size={16} stroke={1.7} /></Button>
      <Button label="Undo" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}><Undo2 aria-hidden size={16} stroke={1.7} /></Button>
      <Button label="Redo" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}><Redo2 aria-hidden size={16} stroke={1.7} /></Button>
    </div>
    <div className={editorStyles.editorSurface}>
      <EditorContent editor={editor} />
    </div>
    <div className={editorStyles.imageUpload}>
      <input accept="image/png,image/jpeg,image/webp" aria-label="Image to insert" className={styles.input} disabled={!canManageMedia || uploadingImage} id={fileId} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} ref={imageFileRef} type="file" />
      <label className={styles.field} htmlFor={altId}><span className={styles.fieldLabel}>Image alternative text</span><input className={styles.input} disabled={!canManageMedia || uploadingImage} id={altId} maxLength={300} onChange={(event) => setImageAlt(event.target.value)} value={imageAlt} /></label>
      <button className={styles.secondaryButton} disabled={!canManageMedia || uploadingImage || !imageFile || !imageAlt.trim() || imageCount >= MAX_INLINE_IMAGES} onClick={() => void insertImage()} type="button">{uploadingImage ? "Uploading image…" : "Upload and insert"}</button>
      <p className={styles.fieldHint}>{canManageMedia ? `Managed images only. ${imageCount}/${MAX_INLINE_IMAGES} inline images used; gallery limit is separate.` : "Image uploads require the Media manager permission."}</p>
    </div>
    {(uploadError || editorError) && <p className={styles.inlineError} role="alert">{uploadError || editorError}</p>}
    {selectedImage && <div className={editorStyles.imageProperties}>
      <label className={styles.field}><span className={styles.fieldLabel}>Image alternative text</span><input className={styles.input} maxLength={300} onChange={(event) => editor.chain().focus().updateAttributes("image", { alt: event.target.value }).run()} value={String(selectedImage.alt ?? "")} /></label>
      <label className={styles.field}><span className={styles.fieldLabel}>Image caption</span><input className={styles.input} maxLength={500} onChange={(event) => editor.chain().focus().updateAttributes("image", { caption: event.target.value || null }).run()} value={String(selectedImage.caption ?? "")} /></label>
      <Button label="Remove selected image" onClick={() => editor.chain().focus().deleteSelection().run()}>Remove image</Button>
    </div>}
  </section>;
}
