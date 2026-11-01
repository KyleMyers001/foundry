import { cn } from "@bb/shared-ui/lib/utils";

export function FoundryLogo({
  className = "size-4",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      src="/foundry-mark.png"
      alt={decorative ? "" : "Foundry"}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn(className, "object-contain")}
    />
  );
}
