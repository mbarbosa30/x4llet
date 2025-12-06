import { cn } from "@/lib/utils"

interface MarqueeProps {
  children: React.ReactNode
  className?: string
  speed?: number
  pauseOnHover?: boolean
}

export function Marquee({ 
  children, 
  className,
  speed = 30,
  pauseOnHover = true 
}: MarqueeProps) {
  return (
    <div 
      className={cn(
        "w-full overflow-hidden bg-foreground text-background py-2",
        className
      )}
    >
      <div 
        className={cn(
          "flex whitespace-nowrap",
          pauseOnHover && "hover:[animation-play-state:paused]"
        )}
        style={{
          animation: `marquee ${speed}s linear infinite`,
        }}
      >
        <div className="flex items-center gap-8 px-4">
          {children}
        </div>
        <div className="flex items-center gap-8 px-4" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  )
}

interface MarqueeItemProps {
  children: React.ReactNode
  className?: string
}

export function MarqueeItem({ children, className }: MarqueeItemProps) {
  return (
    <span className={cn(
      "font-mono text-xs uppercase tracking-widest flex items-center gap-2",
      className
    )}>
      <span className="text-background/50">///</span>
      {children}
    </span>
  )
}
