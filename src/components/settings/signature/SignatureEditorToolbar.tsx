import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline, Strikethrough, Image, Link,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const FONTS = [
  "Arial", "Helvetica", "Georgia", "Times New Roman",
  "Verdana", "Trebuchet MS", "Courier New", "Tahoma",
];

const FONT_SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Medium", value: "4" },
  { label: "Large", value: "5" },
  { label: "XL", value: "6" },
];

interface Props {
  onInsertImage: (file: File) => void;
  onInsertLink: () => void;
}

export function SignatureEditorToolbar({ onInsertImage, onInsertLink }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-muted/30 rounded-t-lg">
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("bold")} title="Bold">
        <Bold className="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("italic")} title="Italic">
        <Italic className="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("underline")} title="Underline">
        <Underline className="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("strikeThrough")} title="Strikethrough">
        <Strikethrough className="w-3.5 h-3.5" />
      </Button>

      <div className="w-px h-5 bg-border mx-1" />

      <Select onValueChange={(v) => exec("fontName", v)}>
        <SelectTrigger className="h-7 w-[110px] text-xs">
          <SelectValue placeholder="Font" />
        </SelectTrigger>
        <SelectContent>
          {FONTS.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => exec("fontSize", v)}>
        <SelectTrigger className="h-7 w-[80px] text-xs">
          <SelectValue placeholder="Size" />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-px h-5 bg-border mx-1" />

      <label title="Text color" className="relative cursor-pointer">
        <div className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-xs font-bold">A</div>
        <input
          type="color"
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          onChange={(e) => exec("foreColor", e.target.value)}
        />
      </label>

      <label title="Highlight" className="relative cursor-pointer">
        <div className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-xs">🖍</div>
        <input
          type="color"
          defaultValue="#ffff00"
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          onChange={(e) => exec("hiliteColor", e.target.value)}
        />
      </label>

      <div className="w-px h-5 bg-border mx-1" />

      <Button
        type="button" variant="ghost" size="icon" className="h-7 w-7"
        onClick={() => fileRef.current?.click()}
        title="Insert Image"
      >
        <Image className="w-3.5 h-3.5" />
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onInsertImage(f);
          e.target.value = "";
        }}
      />

      <Button
        type="button" variant="ghost" size="icon" className="h-7 w-7"
        onClick={onInsertLink}
        title="Insert Link"
      >
        <Link className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
