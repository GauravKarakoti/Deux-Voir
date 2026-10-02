import { useEffect, useRef, type ClipboardEvent, type ReactNode } from 'react';
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, Subscript, Superscript, Table2, Underline, Undo2 } from 'lucide-react';

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<string>;
  imageUploadPending?: boolean;
};

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  imageUploadPending = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection && savedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
  };

  const runCommand = (command: string, value?: string) => {
    restoreSelection();
    document.execCommand(command, false, value);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
    saveSelection();
  };

  const addLink = () => {
    const address = window.prompt('Enter the link URL');
    if (!address) return;
    try {
      const parsed = new URL(address);
      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        window.alert('Use an HTTP, HTTPS, or mailto link.');
        return;
      }
    } catch {
      window.alert('Enter a valid URL.');
      return;
    }
    runCommand('createLink', address);
  };

  const insertUploadedImage = async (file: File) => {
    saveSelection();
    const url = await onUploadImage(file);
    const suggestedAlt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    const alt = window.prompt('Describe this image for screen readers', suggestedAlt);
    const markup = `<figure class="paper-figure"><img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt ?? suggestedAlt)}" loading="lazy"></figure><p></p>`;
    restoreSelection();
    document.execCommand('insertHTML', false, markup);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
    saveSelection();
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (!imageFiles.length) return;
    event.preventDefault();
    saveSelection();
    void (async () => {
      try {
        for (const file of imageFiles) await insertUploadedImage(file);
      } catch {
        // The parent owns the upload error message.
      }
    })();
  };

  const button = (
    label: string,
    icon: ReactNode,
    action: () => void,
    testId: string,
    disabled = false,
  ) => (
    <button
      className="editor-tool"
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      {icon}
    </button>
  );

  return (
    <div className="rich-text-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Paper formatting">
        {button('Paragraph', <span className="tool-letter">P</span>, () => runCommand('formatBlock', '<p>'), 'editor-paragraph')}
        {button('Heading 2', <Heading2 size={15}/>, () => runCommand('formatBlock', '<h2>'), 'editor-heading-2')}
        {button('Heading 3', <Heading3 size={15}/>, () => runCommand('formatBlock', '<h3>'), 'editor-heading-3')}
        <span className="tool-divider" aria-hidden="true"/>
        {button('Bold', <Bold size={15}/>, () => runCommand('bold'), 'editor-bold')}
        {button('Italic', <Italic size={15}/>, () => runCommand('italic'), 'editor-italic')}
        {button('Underline', <Underline size={15}/>, () => runCommand('underline'), 'editor-underline')}
        {button('Subscript', <Subscript size={15}/>, () => runCommand('subscript'), 'editor-subscript')}
        {button('Superscript', <Superscript size={15}/>, () => runCommand('superscript'), 'editor-superscript')}
        <span className="tool-divider" aria-hidden="true"/>
        {button('Bulleted list', <List size={15}/>, () => runCommand('insertUnorderedList'), 'editor-list')}
        {button('Numbered list', <ListOrdered size={15}/>, () => runCommand('insertOrderedList'), 'editor-ordered-list')}
        {button('Block quote', <Quote size={15}/>, () => runCommand('formatBlock', '<blockquote>'), 'editor-quote')}
        {button('Insert link', <Link2 size={15}/>, addLink, 'editor-link')}
        {button('Insert table', <Table2 size={15}/>, () => runCommand('insertHTML', '<table class="paper-table"><tbody><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p></p>'), 'editor-table')}
        {button('Upload image', <ImagePlus size={15}/>, () => { saveSelection(); imageInputRef.current?.click(); }, 'editor-image', imageUploadPending)}
        {button('Undo', <Undo2 size={15}/>, () => runCommand('undo'), 'editor-undo')}
        {button('Redo', <Redo2 size={15}/>, () => runCommand('redo'), 'editor-redo')}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          data-testid="input-content-image"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void insertUploadedImage(file).catch(() => undefined);
          }}
        />
      </div>
      <div
        ref={editorRef}
        className="editor-canvas prose-editorial"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Research paper content"
        aria-multiline="true"
        data-placeholder="Write the research paper here…"
        data-testid="input-paper-content"
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        onPaste={onPaste}
      />
      <p className="help-text editor-help">Paste or upload an image to store it in Cloudinary. Content is sanitized before publication.</p>
    </div>
  );
}