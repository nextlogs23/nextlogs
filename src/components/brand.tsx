import Image from "next/image";
import Link from "next/link";

export function Brand({ light=false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="DMB Logs Portal home"
      className={`group inline-flex items-center gap-2.5 rounded-2xl font-black tracking-[-.04em] text-lg sm:text-xl ${light ? "bg-white/95 py-1 pl-1 pr-3 text-[#14233b] shadow-[0_10px_30px_rgba(0,0,0,.12)]" : "text-[#14233b]"}`}
    >
      <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-[#dfe6ee]">
        <Image
          src="/dmb-logins-logo.png"
          alt=""
          width={500}
          height={500}
          priority
          className="absolute left-1/2 top-[-3px] h-[70px] w-[70px] max-w-none -translate-x-1/2 object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </span>
      <span className="whitespace-nowrap">DMB Logs Portal</span>
    </Link>
  );
}
