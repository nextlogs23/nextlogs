import Link from "next/link";
import { Sparkles } from "lucide-react";

export function Brand({ light=false }: { light?: boolean }) {
  return <Link href="/" className="flex items-center gap-2.5 font-black tracking-[-.04em] text-xl"><span className={`grid h-9 w-9 place-items-center rounded-xl ${light?'bg-[#9ef0ff] text-[#211b52]':'bg-[#6757e8] text-white'}`}><Sparkles size={17}/></span>DMB Logs Portal</Link>;
}
