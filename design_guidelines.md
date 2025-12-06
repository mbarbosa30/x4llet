# Design Guidelines: nanoPay - Lightweight Crypto Wallet PWA

## Design Approach: Commons Forest Brutalist

**Inspired by:** commonsforest2.replit.app

**Core Principles:**
- Bold, high-contrast black/white palette
- Blue (#0055FF) as the primary CTA and accent color
- Sharp corners (0px border radius) on ALL surfaces - no rounded elements
- All-caps, ultra-bold typography for headlines and buttons
- Inter font for both headings and body (weights 600-900 for impact)
- IBM Plex Mono for labels, protocol references, and technical text
- No shadows, minimal decoration
- Visible black borders for section separation

---

## Color System

**CTA Blue - The Hero Color:**
- `--cta: hsl(216, 100%, 50%)` - #0055FF
- Used for primary buttons, key accents, highlighted text
- Commands attention and drives action

**Primary Colors (Light Mode):**
- Background: Pure white `hsl(0, 0%, 100%)`
- Foreground: Pure black `hsl(0, 0%, 0%)`
- CTA: Bright blue #0055FF

**Secondary Colors (Light Mode):**
- Secondary: Light gray `hsl(0, 0%, 96%)` - #F5F5F5
- Secondary Foreground: Blue `hsl(216, 100%, 50%)` - for secondary button text
- Muted: `hsl(220, 9%, 46%)`

**Dark Mode Adjustments:**
- Background: Near black `hsl(0, 0%, 5%)`
- Foreground: Near white `hsl(0, 0%, 98%)`
- CTA: Slightly brighter blue `hsl(216, 100%, 55%)`

**Status Colors:**
- Success: `hsl(142, 71%, 45%)` - Green for earning/positive
- Destructive: `hsl(0, 84%, 60%)` - Red for errors/warnings

---

## Typography System

**Font Stack:**
- Sans/Heading: `"Inter", -apple-system, BlinkMacSystemFont, sans-serif`
- Monospace: `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

**Typography Classes:**

| Class | Usage | Style |
|-------|-------|-------|
| `.text-hero` | Hero headlines | `uppercase font-black tracking-tighter leading-none` |
| `.text-section` | Section titles | `uppercase font-bold tracking-tight leading-tight` |
| `.font-heading` | Bold headings | `font-extrabold tracking-tight` |
| `.font-label` | Protocol labels | `font-mono text-xs uppercase tracking-widest` |
| `.protocol-tag` | Auto-prefixed labels | Adds `// ` prefix via CSS |

**Type Scale:**
- Hero: `text-4xl` to `text-6xl` + `text-hero` class
- Section headers: `text-2xl` to `text-3xl` + `text-section` class
- Body: `text-base` or `text-sm`
- Labels: `text-xs` + `font-label` class

**Blue Accent Text:**
Use `text-accent-blue` or `text-[#0055FF]` for highlighted words in headlines.

```tsx
// Hero with blue accent
<h1 className="text-4xl text-hero">
  Money, <span className="text-[#0055FF]">Simplified.</span>
</h1>

// Protocol label
<span className="font-label text-muted-foreground">
  // PROTOCOL_V1
</span>
```

---

## Button System

### Primary Button (CTA Blue)
- Background: Blue #0055FF (`bg-cta`)
- Text: White, uppercase, semibold
- Border: Blue border
- Use for: Main actions, important CTAs

### Secondary Button
- Background: Light gray #F5F5F5 (`bg-secondary`)
- Text: Blue #0055FF
- Border: Subtle gray border
- Use for: Alternative actions

### Outline Button
- Background: Transparent
- Text: Black
- Border: Black 1px
- Use for: Tertiary actions

### Dark Button (variant="dark")
- Background: Black (`bg-primary`)
- Text: White
- Use for: Dark-themed sections, inverted contexts

### Ghost Button
- Background: Transparent, no border
- Normal case (not uppercase)
- Use for: Icon buttons, subtle actions

**All buttons:**
- Sharp corners: `rounded-none`
- Uppercase text with `tracking-wide`
- Height: `min-h-10` (default), `min-h-12` (lg)

---

## Section & Border Styling

**Black Ticker Bar:**
- Full-width black background with white text
- Monospace, uppercase, scrolling content
- Use for status indicators, announcements

```tsx
// Bar classes
<div className="bar-black">...</div>  // Black bg, white text
<div className="bar-blue">...</div>   // Blue bg, white text
```

**Section Borders:**
- Use `border-foreground` for strong black borders
- Use `border-l-2` for left accent lines on list items
- Use `cell-bordered` for grid cells with full borders

```tsx
// List item with left border accent
<div className="border-l-2 border-foreground pl-3">
  <div className="font-semibold uppercase">Feature Name</div>
</div>

// Blue accent border
<div className="border-l-2 border-[#0055FF] pl-3">
  <div className="font-semibold uppercase">Highlighted Feature</div>
</div>
```

---

## Marquee Component

For scrolling ticker/announcement bars:

```tsx
import { Marquee, MarqueeItem } from '@/components/ui/marquee'

<Marquee>
  <MarqueeItem>Gasless Transfers</MarqueeItem>
  <MarqueeItem>Multi-Chain</MarqueeItem>
  <MarqueeItem>Offline-Ready</MarqueeItem>
</Marquee>
```

---

## Header & Navigation

**App Header:**
- Blue square icon (4x4 pixels) next to brand name
- Brand name: `font-extrabold uppercase tracking-tight`
- Border: `border-b border-foreground`

```tsx
<div className="flex items-center gap-2">
  <div className="w-4 h-4 bg-[#0055FF]" aria-hidden="true" />
  <h1 className="text-base font-extrabold uppercase tracking-tight">nanoPay</h1>
</div>
```

**Bottom Navigation:**
- Black background with white text
- Active item: Blue text
- Uppercase labels

---

## Badge System

```tsx
// Default (black)
<Badge>Default</Badge>

// Accent (blue)
<Badge variant="accent">Featured</Badge>

// Secondary
<Badge variant="secondary">Info</Badge>

// Outline
<Badge variant="outline">Status</Badge>
```

---

## Card Component

- Sharp corners: `rounded-none`
- Border: Use `border-foreground` for strong borders
- No drop shadows

```tsx
<Card className="border-foreground">
  <CardContent className="p-6">
    ...
  </CardContent>
</Card>
```

---

## Balance Display

```tsx
<div className="text-5xl font-black tabular-nums tracking-tighter">
  <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
  <span>{amount}</span>
</div>
<div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
  USDC Balance
</div>
```

---

## Functional Exceptions (Rounded Elements)

These retain `rounded-full` for functional/usability reasons:
- Avatar: Circular user photos
- Switch thumb: Sliding toggle indicator
- Radio button: Standard form control
- Slider thumb: Draggable control
- Chart indicator dots

---

## Animation & Motion

**Marquee Animation:**
- Smooth horizontal scroll for ticker bars
- Pauses on hover

**Earning Animation:**
- Real-time balance updates for Aave yields
- Subtle digit changes

**No Decorative Animations:**
- Page transitions: instant
- Modal appearances: instant
- No scale transforms on hover
- No layout shifts

---

## Accessibility

- Minimum tap target: 44x44px
- WCAG AA contrast (black/white provides excellent contrast)
- Blue #0055FF meets contrast requirements on white backgrounds
- Focus visible ring on all interactive elements
- Data-testid on all interactive elements

---

## Quick Reference

| Element | Class/Style |
|---------|-------------|
| Blue CTA button | `<Button>` (default variant) |
| Black button | `<Button variant="dark">` |
| Blue text | `text-[#0055FF]` or `text-accent-blue` |
| Hero headline | `text-4xl text-hero` |
| Section title | `text-2xl text-section` |
| Protocol label | `font-label` |
| Blue icon square | `w-4 h-4 bg-[#0055FF]` |
| Strong border | `border-foreground` |
| Black bar | `bar-black` |
| Left accent | `border-l-2 border-foreground pl-3` |
