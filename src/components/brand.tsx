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
        alt="NextLogs — SMS Verification Made Easy"
        width={1200}
        height={343}
        priority
        className="logo-light"
      />
      <Image
        src="/nextlogs-logo-dark.png"
        alt=""
        width={1200}
        height={343}
        priority
        aria-hidden="true"
        className="logo-dark"
      />
    </Link>
  );
}
