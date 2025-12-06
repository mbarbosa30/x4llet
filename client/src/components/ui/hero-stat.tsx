import * as React from "react"
import { cn } from "@/lib/utils"

interface HeroStatProps extends React.HTMLAttributes<HTMLDivElement> {
  value: React.ReactNode
  label: string
  sublabel?: string
}

const HeroStat = React.forwardRef<HTMLDivElement, HeroStatProps>(
  ({ className, value, label, sublabel, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-[#0055FF] text-white p-6 text-center",
        className
      )}
      {...props}
    >
      <div className="text-5xl font-bold tabular-nums tracking-tight">
        {value}
      </div>
      <div className="text-sm font-mono uppercase tracking-widest mt-2 opacity-80">
        {label}
      </div>
      {sublabel && (
        <div className="text-xs opacity-60 mt-1">
          {sublabel}
        </div>
      )}
    </div>
  )
)
HeroStat.displayName = "HeroStat"

const HeroStatCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-[#0055FF] text-white rounded-none",
      className
    )}
    {...props}
  >
    {children}
  </div>
))
HeroStatCard.displayName = "HeroStatCard"

export { HeroStat, HeroStatCard }
