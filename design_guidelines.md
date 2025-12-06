# Design Guidelines: nanoPay - Lightweight Crypto Wallet PWA

## Design Approach: Relay Stories Inspired

**Selected Approach:** Warm, modern design system with distinctive typography and clean aesthetics inspired by Relay Stories

**Core Principles:**
- Warm coral primary color (#F5623D) for energy and friendliness
- Sharp-cornered containers paired with pill-shaped buttons for visual contrast
- Outfit font for headings, Inter for body text
- Colored shadows on primary buttons for depth and tactile feel
- Clean white backgrounds with subtle card differentiation

---

## Color System

**Primary Colors (Light Mode):**
- Primary: `hsl(12, 90%, 60%)` - Warm coral (#F5623D)
- Primary Foreground: White
- Primary Shadow: `0px 10px 15px -3px rgba(245, 98, 61, 0.4)`

**Background & Surface (Light Mode):**
- Background: Pure white `hsl(0, 0%, 100%)`
- Card: Very subtle off-white `hsl(0, 0%, 99%)`
- Card Border: Light gray `hsl(0, 0%, 91%)`

**Text (Light Mode):**
- Foreground: Near black `hsl(240, 10%, 4%)`
- Muted Foreground: `hsl(0, 0%, 45%)`

**Primary Colors (Dark Mode):**
- Primary: `hsl(12, 90%, 58%)` - Slightly brighter coral
- Background: Deep dark `hsl(240, 10%, 4%)`
- Card: `hsl(240, 8%, 7%)`

**Status Colors:**
- Success: `hsl(142, 71%, 45%)` - Green for earning/positive
- Destructive: `hsl(0, 84%, 60%)` - Red for errors/warnings

---

## Typography System

**Font Stack:**
- Headings: `"Outfit", -apple-system, BlinkMacSystemFont, sans-serif`
- Body: `"Inter", -apple-system, BlinkMacSystemFont, sans-serif`
- Monospace: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

**Type Scale with Font Assignments:**
- Hero balances: `text-5xl font-bold font-heading tracking-tight`
- Page titles: `text-2xl font-bold font-heading tracking-tight`
- Section headers: `text-lg font-bold font-heading`
- App header: `text-lg font-bold font-heading tracking-tight`
- Body/labels: `text-sm font-sans`
- Micro text: `text-xs font-sans`
- Addresses/codes: `font-mono`

**Typography Rules:**
- All monetary amounts use `tabular-nums` for alignment
- Headings use `tracking-tight` for compact, modern feel
- Dollar signs rendered at smaller size with reduced opacity

---

## Component Specifications

### Buttons
**Primary Button:**
- Shape: Fully rounded (pill) - `rounded-full`
- Height: `min-h-10` (default), `min-h-12` (lg)
- Padding: `px-6` (default), `px-8` (lg)
- Shadow: Colored coral shadow - `shadow-primary`
- Border: Subtle darker coral border

**Secondary Button:**
- Shape: Fully rounded (pill) - `rounded-full`
- Background: Light gray
- No colored shadow

**Outline Button:**
- Shape: Fully rounded (pill) - `rounded-full`
- Border: `border-foreground/20`
- Background: Transparent

**Ghost Button:**
- Shape: Fully rounded (pill) - `rounded-full`
- Background: Transparent, no border

**Icon Buttons:**
- Size: `h-10 w-10` (matches default button height)
- Shape: Fully rounded - `rounded-full`

### Cards
**Card Component:**
- Shape: Sharp corners - `rounded-none`
- Border: Subtle border using `border-card-border`
- Background: Very subtle off-white
- No drop shadows

### Input Fields
**Text Input:**
- Shape: Sharp corners - `rounded-none`
- Height: `h-10`
- Border: Standard input border
- Padding: `px-4`

### Badges
**Badge Component:**
- Shape: Fully rounded (pill) - `rounded-full`
- Padding: `px-3 py-0.5`
- Font: `text-xs font-medium`

### Dialogs/Modals
**Dialog Content:**
- Shape: Sharp corners - `rounded-none`
- Shadow: `shadow-xl` for floating effect
- Padding: `p-5 sm:p-6`

### Select Component
**SelectTrigger (Interactive):**
- Shape: Fully rounded (pill) - `rounded-full`
- Height: `h-10`
- This is an interactive element, so it follows the pill pattern

**SelectContent (Container):**
- Shape: Sharp corners - `rounded-none`
- This is a dropdown container, so it follows the sharp pattern

**SelectItem (Interactive):**
- Shape: Fully rounded (pill) - `rounded-full`
- Items inside the dropdown are interactive

### Tabs Component
**TabsList (Container):**
- Shape: Sharp corners - `rounded-none`
- Background: `bg-muted`
- This is a container holding tab triggers

**TabsTrigger (Interactive):**
- Shape: Fully rounded (pill) - `rounded-full`
- Each tab trigger is an interactive element

### Dropdown Menu
**DropdownMenuContent (Container):**
- Shape: Sharp corners - `rounded-none`

**DropdownMenuItem (Interactive):**
- Shape: Fully rounded (pill) - `rounded-full`

---

## Layout System

**Screen Structure:**
- Fixed header: `h-16` with app branding
- Scrollable content with safe area padding
- Fixed bottom navigation when applicable
- Container: `max-w-md` (448px) centered

**Spacing:**
- Primary spacing unit: 4 (Tailwind's base unit)
- Content padding: `p-4`
- Component gaps: `space-y-4` or `gap-4`
- Section spacing: `space-y-6`

---

## Visual Contrast Pattern

**Key Design Choice: Sharp vs. Round**
The design creates visual interest through contrast:
- Containers (cards, dialogs, inputs): Sharp corners
- Interactive elements (buttons, badges): Pill shape

This creates a clear visual hierarchy where actions stand out from content areas.

---

## Balance Display Pattern

**Primary Balance Card:**
```
<div className="text-5xl font-bold tabular-nums font-heading tracking-tight">
  <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
  <span>{amount}</span>
</div>
```

**Key Elements:**
- Dollar sign at smaller size with reduced opacity
- Main digits in Outfit font, bold weight
- Decimal precision shown with reduced opacity
- Earning animation extras shown in small text with success color

---

## Header Component

**App Header:**
- Brand name: `text-lg font-bold font-heading tracking-tight`
- Height: `h-16` fixed
- Trust score badge: Pill shape with icon
- Icon buttons: Ghost variant, size icon

---

## Animation & Motion

**Allowed Animations:**
- Real-time balance earning animation (for Aave yields)
- Loading spinners
- Subtle hover elevations via CSS utilities

**No Animations:**
- Page transitions (instant)
- Modal appearances (instant)
- Layout changes on hover

---

## Iconography

**Icon Library:** Lucide React
- Navigation: `Wallet`, `TrendingUp`, `Coins`, `Sparkles`
- Actions: `ArrowUpRight`, `ArrowDownLeft`, `Copy`, `Share2`
- Status: `Check`, `AlertCircle`, `Clock`, `Shield`
- Size: `h-5 w-5` for buttons, `h-4 w-4` for inline

---

## Trust & Financial UI Patterns

**Earning Indicators:**
- Pulsing green dot for active earning
- Small superscript digits for extra precision
- APY displayed in badges

**Transaction Status:**
- Send: Negative prefix, `ArrowUpRight` icon
- Receive: Positive styling, `ArrowDownLeft` icon
- Chain badges for multi-chain context

---

## Responsive Behavior

- Mobile-first: 360px minimum width
- Single column layout maintained throughout
- Container max-width: 448px centered
- No layout changes between breakpoints

---

## Accessibility

- Minimum tap target: 44x44px
- WCAG AA contrast ratios
- Focus visible on all interactive elements
- Proper form labels and error states
- Data-testid on all interactive elements
