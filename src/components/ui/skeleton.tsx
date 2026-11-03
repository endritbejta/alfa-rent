import { cn } from "@/lib/utils";

/** The pulse holds still for anyone who has asked for reduced motion. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-skeleton animate-pulse rounded-none motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
