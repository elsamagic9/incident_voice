import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-zinc-700/60 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-800",
        destructive:
          "border-rose-500/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25",
        outline: "text-foreground border-zinc-700",
        success:
          "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
        warning:
          "border-amber-500/30 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25",
        cyan:
          "border-cyan-500/30 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
