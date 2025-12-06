# Design Guidelines: nanoPay - Lightweight Crypto Wallet PWA

## Design Approach: Commons Forest Brutalist

**Selected Approach:** Minimal brutalist design system inspired by commonsforest2.replit.app

**Core Principles:**
- Black and white primary palette with blue (#0055FF) accent
- Sharp corners (0px border radius) everywhere - no rounded elements
- Inter font for both headings and body text (bold weights for headings)
- IBM Plex Mono for labels, protocol references, and technical text
- No shadows, minimal decoration
- High contrast, functional simplicity

---

## Color System

**Primary Colors (Light Mode):**
- Primary: `hsl(0, 0%, 0%)` - Pure black
- Primary Foreground: White
- Accent/Link: `hsl(216, 100%, 50%)` - Bright blue (#0055FF)

**Background & Surface (Light Mode):**
- Background: Pure white `hsl(0, 0%, 100%)`
- Card: White `hsl(0, 0%, 100%)`
- Card Border: Light gray `hsl(0, 0%, 80%)`

**Text (Light Mode):**
- Foreground: Pure black `hsl(0, 0%, 0%)`
- Muted Foreground: `hsl(220, 9%, 46%)`
- Secondary Foreground: Blue `hsl(216, 100%, 50%)` - for secondary button text

**Primary Colors (Dark Mode):**
- Primary: `hsl(0, 0%, 100%)` - White (inverted)
- Primary Foreground: Black
- Accent/Link: `hsl(216, 100%, 60%)` - Brighter blue
- Background: Near black `hsl(0, 0%, 5%)`
- Card: `hsl(0, 0%, 8%)`

**Status Colors:**
- Success: `hsl(142, 71%, 45%)` - Green for earning/positive
- Destructive: `hsl(0, 84%, 60%)` - Red for errors/warnings

---

## Typography System

**Font Stack:**
- Headings: `"Inter", -apple-system, BlinkMacSystemFont, sans-serif` (weights 600-900)
- Body: `"Inter", -apple-system, BlinkMacSystemFont, sans-serif` (weights 400-500)
- Monospace: `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

**Type Scale with Font Assignments:**
- Hero text: `text-6xl font-black font-heading tracking-tight` (96px for display)
- Page titles: `text-4xl font-bold font-heading tracking-tight`
- Section headers: `text-2xl font-bold font-heading`
- App header: `text-lg font-bold font-heading tracking-tight`
- Body/labels: `text-sm font-sans`
- Micro text: `text-xs font-sans`
- Protocol labels: `font-mono text-xs uppercase tracking-wider` (use font-label class)

**Typography Rules:**
- All monetary amounts use `tabular-nums` for alignment
- Headings use `tracking-tight` for bold, condensed feel
- Protocol labels use uppercase with letter-spacing
- Dollar signs rendered at smaller size with reduced opacity

**Usage Examples:**
```tsx
// Hero heading
<h1 className="text-6xl font-black tracking-tight">
  INFRASTRUCTURE
</h1>

// Protocol label
<span className="font-label text-muted-foreground">
  [ PROTOCOL_V1 ]
</span>

// Section label
<span className="font-mono text-sm">// MUTUAL_CREDIT</span>
```

---

## Component Specifications

### Buttons
**Primary Button:**
- Shape: Sharp corners - `rounded-none`
- Background: Black (white in dark mode)
- Text: White (black in dark mode)
- Height: `min-h-10` (default), `min-h-12` (lg)
- Padding: `px-6` (default), `px-8` (lg)
- No shadow

**Secondary Button:**
- Shape: Sharp corners - `rounded-none`
- Background: Light gray (#F5F5F5)
- Text: Blue (#0055FF)
- Border: Subtle gray border

**Outline Button:**
- Shape: Sharp corners - `rounded-none`
- Border: `border-foreground/20`
- Background: Transparent

**Ghost Button:**
- Shape: Sharp corners - `rounded-none`
- Background: Transparent, no border

**Icon Buttons:**
- Size: `h-10 w-10` (matches default button height)
- Shape: Sharp corners - `rounded-none`

### Cards
**Card Component:**
- Shape: Sharp corners - `rounded-none`
- Border: 1px solid border using `border-card-border`
- Background: White (matches background or subtle distinction)
- No drop shadows

### Input Fields
**Text Input:**
- Shape: Sharp corners - `rounded-none`
- Height: `h-10`
- Border: Standard input border (#CCCCCC)
- Padding: `px-4`

### Badges
**Badge Component:**
- Shape: Sharp corners - `rounded-none`
- Padding: `px-3 py-0.5`
- Font: `text-xs font-medium`

### Dialogs/Modals
**Dialog Content:**
- Shape: Sharp corners - `rounded-none`
- Shadow: `shadow-xl` for floating effect
- Padding: `p-5 sm:p-6`

### Select Component
**SelectTrigger:**
- Shape: Sharp corners - `rounded-none`
- Height: `h-10`

**SelectContent:**
- Shape: Sharp corners - `rounded-none`

**SelectItem:**
- Shape: Sharp corners - `rounded-none`

### Tabs Component
**TabsList:**
- Shape: Sharp corners - `rounded-none`
- Background: `bg-muted`

**TabsTrigger:**
- Shape: Sharp corners - `rounded-none`

### All Menu Components
- DropdownMenu, ContextMenu, Menubar: All `rounded-none`
- Menu items: `rounded-none`

### Exceptions (Functional Circles)
These retain `rounded-full` for functional reasons:
- Avatar: Circular user photos
- Switch thumb: Sliding toggle indicator
- Radio button: Standard form control
- Slider thumb: Draggable control

---

## Layout System

**Screen Structure:**
- Fixed header: `h-16` with app branding
- Scrollable content with safe area padding
- Fixed bottom navigation when applicable
- Container: `max-w-md` (448px) centered

**Spacing:**
- Primary spacing unit: 8px
- Content padding: `p-4`
- Component gaps: `gap-4`
- Section spacing: `space-y-6`
- Large section gaps: `space-y-8` or `space-y-12`

---

## Visual Language

**Key Design Choice: All Sharp Corners**
Unlike the previous design, there is NO contrast between interactive and container elements. Everything is sharp and geometric, creating a bold brutalist aesthetic.

**Grid & Alignment:**
- Strong horizontal lines
- Clean column layouts
- Generous whitespace
- Bold typography as visual anchors

---

## Balance Display Pattern

**Primary Balance Card:**
```tsx
<div className="text-5xl font-bold tabular-nums tracking-tight">
  <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
  <span>{amount}</span>
</div>
```

**Stats Display:**
```tsx
<div className="text-6xl font-bold">42</div>
<div className="text-sm text-muted-foreground">Active Hubs</div>
```

---

## Header Component

**App Header:**
- Brand name: `text-lg font-bold tracking-tight`
- Height: `h-16` fixed
- Clean, minimal navigation
- Icon buttons: Ghost variant

---

## Animation & Motion

**Minimal to None:**
- Real-time balance earning animation (for Aave yields)
- Loading spinners
- Subtle hover opacity changes

**No Decorative Animations:**
- Page transitions (instant)
- Modal appearances (instant)
- No layout changes on hover
- No scale transforms

---

## Iconography

**Icon Library:** Lucide React
- Navigation: `Wallet`, `TrendingUp`, `Coins`, `Sparkles`
- Actions: `ArrowUpRight`, `ArrowDownLeft`, `Copy`, `Share2`
- Status: `Check`, `AlertCircle`, `Clock`, `Shield`
- Size: `h-5 w-5` for buttons, `h-4 w-4` for inline
- Color: Inherit from text color

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
- WCAG AA contrast ratios (black/white provides excellent contrast)
- Focus visible ring on all interactive elements
- Proper form labels and error states
- Data-testid on all interactive elements
