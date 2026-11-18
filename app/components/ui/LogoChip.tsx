import { cn } from "./cn";

interface LogoChipProps {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
}

export function LogoChip({ src, alt, className, imgClassName }: LogoChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-white p-1.5 shadow-[var(--elev-1)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={imgClassName ?? "h-8 w-auto"}
      />
    </span>
  );
}
