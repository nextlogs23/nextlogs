import type { CSSProperties } from "react";
import {
  BookOpen,
  Boxes,
  Brush,
  Clapperboard,
  Code2,
  Download,
  FileText,
  Headphones,
  Image as ImageIcon,
  LayoutTemplate,
  Megaphone,
  Repeat2,
  Sparkles,
  WandSparkles,
} from "lucide-react";

type ProductGeneratedIconProps = {
  id: string;
  title: string;
  category: string;
  kind: string;
};

const palettes = [
  ["#0757d8", "#4aa9ff", "#dff2ff"],
  ["#6537d7", "#a462ff", "#eee7ff"],
  ["#007b68", "#35c59b", "#daf8ef"],
  ["#cf3f6b", "#ff7f9e", "#ffe6ee"],
  ["#c45b0a", "#ffab3d", "#fff0d7"],
  ["#075f73", "#23b7cd", "#dcf7fb"],
  ["#3946bd", "#7786ff", "#e7e9ff"],
  ["#9b3b87", "#e171ca", "#fae4f6"],
] as const;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function productSymbol(title: string, category: string, kind: string) {
  const value = `${title} ${category} ${kind}`.toLowerCase();
  if (/instagram|social|facebook|tiktok|content/.test(value)) return <Megaphone aria-hidden="true" />;
  if (/template|notion|planner|worksheet/.test(value)) return <LayoutTemplate aria-hidden="true" />;
  if (/ebook|book|guide|course/.test(value)) return <BookOpen aria-hidden="true" />;
  if (/video|reel|motion|film/.test(value)) return <Clapperboard aria-hidden="true" />;
  if (/audio|music|sound|podcast/.test(value)) return <Headphones aria-hidden="true" />;
  if (/photo|image|preset/.test(value)) return <ImageIcon aria-hidden="true" />;
  if (/design|brand|logo|graphic/.test(value)) return <Brush aria-hidden="true" />;
  if (/software|code|script|developer/.test(value)) return <Code2 aria-hidden="true" />;
  if (/subscription|membership/.test(value)) return <Repeat2 aria-hidden="true" />;
  if (/document|pdf|file/.test(value)) return <FileText aria-hidden="true" />;
  if (/service|setup|managed/.test(value)) return <WandSparkles aria-hidden="true" />;
  if (/download|digital/.test(value)) return <Download aria-hidden="true" />;
  return category === "social_assets" ? <Sparkles aria-hidden="true" /> : <Boxes aria-hidden="true" />;
}

function monogram(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "NL";
  return `${words[0][0] ?? ""}${words.length > 1 ? words.at(-1)?.[0] ?? "" : words[0][1] ?? ""}`.toUpperCase();
}

export function ProductGeneratedIcon({ id, title, category, kind }: ProductGeneratedIconProps) {
  const seed = hash(`${id}:${title}:${category}:${kind}`);
  const palette = palettes[seed % palettes.length];
  const style = {
    "--product-icon-primary": palette[0],
    "--product-icon-secondary": palette[1],
    "--product-icon-soft": palette[2],
    "--product-icon-rotation": `${(seed % 25) - 12}deg`,
  } as CSSProperties;

  return (
    <span className="product-generated-icon" style={style} role="img" aria-label={`${title} product icon`}>
      <i aria-hidden="true" />
      {productSymbol(title, category, kind)}
      <b aria-hidden="true">{monogram(title)}</b>
    </span>
  );
}
