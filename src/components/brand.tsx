import Image from "next/image";
import Link from "next/link";

export function Brand({ light=false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Nextlogs home"
      className={`brand-lockup group ${light ? "is-light" : ""}`}
    >
      <Image
        src="/nextlogs-logo.png"
        alt="Nextlogs — Track, Ship, Deliver"
        width={1488}
        height={505}
        priority
        className="logo-light"
      />
      <Image
        src="/nextlogs-logo-dark.png"
        alt=""
        width={1488}
        height={505}
        priority
        aria-hidden="true"
        className="logo-dark"
      />
    </Link>
  );
}
