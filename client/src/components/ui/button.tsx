import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-mono font-bold uppercase tracking-normal transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
  " hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          "bg-cta text-white border border-foreground",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border",
        outline:
          "border border-foreground bg-background",
        secondary: "border bg-secondary text-secondary-foreground border-foreground/20",
        ghost: "border border-transparent normal-case font-sans font-medium tracking-normal",
        dark: "bg-primary text-primary-foreground border border-primary-border",
      },
      size: {
        default: "min-h-10 px-6 py-2",
        sm: "min-h-8 px-4 text-xs",
        lg: "min-h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    compoundVariants: [
      {
        variant: "default",
        size: "default",
        className: "shadow-[4px_4px_0px_0px_rgb(0,0,0)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]",
      },
      {
        variant: "default",
        size: "lg",
        className: "shadow-[4px_4px_0px_0px_rgb(0,0,0)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]",
      },
      {
        variant: "outline",
        size: "default",
        className: "shadow-[4px_4px_0px_0px_rgb(0,0,0)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]",
      },
      {
        variant: "outline",
        size: "lg",
        className: "shadow-[4px_4px_0px_0px_rgb(0,0,0)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
