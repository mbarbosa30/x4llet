# Design Guidelines: Lightweight Crypto Wallet PWA

## Design Approach: Minimal Utility-First System

**Selected Approach:** Streamlined design system optimized for performance, accessibility, and trust

**Rationale:** This is a financial utility application requiring maximum reliability, minimal bandwidth, and instant usability. Design must communicate security and efficiency over visual flourish.

**Core Principles:**
- Clarity and speed over visual embellishment
- Trust through restraint and precision
- Performance-first: every design decision considers bandwidth
- Accessibility without compromise

---

## Typography System

**Font Stack:**
- Primary: System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- Avoids external font loading to minimize bundle size
- Ensures instant rendering with native OS fonts

**Type Scale:**
- Hero numbers (balance): text-5xl (48px) - tabular figures, medium weight
- Screen titles: text-2xl (24px) - semibold
- Primary actions: text-base (16px) - medium
- Body/labels: text-sm (14px) - regular
- Micro text (tx details): text-xs (12px) - regular
- Monospace (addresses): `font-mono` for `0x...` addresses and codes

**Typography Rules:**
- All monetary amounts use tabular figures for alignment
- Recovery codes and addresses always monospace
- Labels use sentence case; buttons use title case
- Line heights: 1.2 for numbers, 1.5 for text

---

## Layout System

**Spacing Primitives:** 
Tailwind units of **2, 4, 8, 12, 16** - creates consistent vertical and horizontal rhythm while keeping limited options for speed

**Screen Structure:**
- All screens follow fixed header (h-16) + scrollable content + optional fixed footer pattern
- Container: max-w-md (448px) centered - optimized for one-handed mobile use
- Padding: px-4 universal horizontal padding; py-6 for content sections
- Safe areas: pb-safe for iOS bottom gestures

**Grid System:**
- Single column layout throughout (no multi-column to avoid confusion)
- Transaction list: full-width items with internal flex layout
- Action buttons: full-width on mobile, max-w-xs on desktop

---

## Component Library

### Core Navigation
**Top Bar (Fixed):**
- Logo/app name (left) - text-lg, semibold
- Screen title (center) - text-base
- Action icon (right) - settings/scan - size-6 icons
- Height: h-16, border-b with subtle divider

**Bottom Navigation (when needed):**
- 3 primary actions maximum (Home, Send, Receive)
- Icon above label pattern
- Active state: heavier icon weight + indicator dot

### Balance Display
**Home Balance Card:**
- Large balance number (text-5xl) - primary position, top third of screen
- Currency symbol and code (text-base) above number
- Fiat equivalent (text-sm, muted) below
- Full-width card with generous padding (p-8)
- Subtle border, slightly elevated with minimal shadow

### Buttons & Actions
**Primary Action Button:**
- Full-width on mobile (w-full)
- Height: h-12
- Text: text-base, medium weight
- Rounded: rounded-lg
- States clearly defined through system defaults (no custom hover states on images)

**Secondary Button:**
- Outlined variant
- Same dimensions as primary
- Muted appearance

**Icon Buttons:**
- Square: size-12
- Icon: size-6
- Rounded: rounded-lg
- Used for QR scan, copy, share actions

### Input Fields
**Amount Input:**
- Custom numeric keypad (3x4 grid)
- Large display area above keypad (text-4xl for entered amount)
- Button size: h-16 w-full for each key
- Grid: grid-cols-3 gap-2

**Address Input:**
- Single text input with paste/scan auxiliary buttons
- Height: h-12
- Monospace font for addresses
- Clear button when populated

### Transaction List
**List Item Structure:**
- Full-width items
- Height: h-20 per transaction
- Flex layout: icon (size-10) | sender/recipient + timestamp | amount
- Border separator between items: border-b
- No hover states (tap to view details)

### QR Code Display
**Receive QR:**
- QR code: size-64 (256px square) - centered
- Address below in monospace (text-xs)
- Copy button: full-width, below address
- Container: p-8 with border

### Status & Feedback
**Transaction Status:**
- Toast notifications: fixed bottom, max-w-sm, p-4
- Auto-dismiss after 3s
- States: success, pending, error (system provides styling)

**Loading States:**
- Skeleton screens for transaction list
- Spinner for active operations (size-8, centered)
- No progress bars (binary states only)

### Modals & Overlays
**Confirmation Sheets:**
- Slide up from bottom
- Max height: 90vh
- Padding: p-6
- Actions at bottom: Cancel (left) + Confirm (right, full-width)

**Recovery Code Display:**
- 12-character code in 3 groups of 4
- Each group in separate card with p-4
- Monospace, text-xl
- "Save as image" and "Print" buttons below

### Settings Screen
**Settings List:**
- Grouped sections with headers (text-xs, uppercase, tracking-wide)
- Items: h-14, with chevron-right icon
- Dividers between items within groups
- Spacing between groups: mb-8

---

## Animation & Motion

**Strict No-Animation Policy:**
- No transitions, transforms, or animations except system defaults
- Page changes: instant (no fade/slide)
- Loading: static spinner only
- Modals: instant appearance (no slide-up animation)

**Exception:** Native system animations only (e.g., iOS sheet presentation)

---

## Iconography

**Icon Library:** Heroicons (outline variant) via CDN
- Navigation: home, arrow-right-start-on-rectangle, cog-6-tooth
- Actions: qr-code, arrow-up, arrow-down, clipboard-document
- Status: check-circle, exclamation-circle, clock
- Size: size-5 for inline, size-6 for buttons, size-10 for list items

---

## Screen-Specific Layouts

### Create Wallet Screen
- Centered content, max-w-sm
- App logo/name at top (mb-12)
- Two bullet points in list (space-y-4)
- Primary "Create Wallet" button (mt-8)
- Optional cloud backup toggle below (mt-4)
- Recovery code shown in modal after creation

### Home Screen
- Balance card at top (mt-4)
- Three action buttons in row below balance (grid-cols-3, gap-2, mt-6)
- Recent transactions heading (text-sm, mt-8, mb-4)
- Transaction list below

### Send Screen
- Recipient input at top with scan button inline
- Amount display (large, centered, mt-8)
- Numeric keypad (mt-12)
- Confirm button fixed at bottom

### Receive Screen
- QR code centered (mt-8)
- Address display below QR (mt-6)
- Copy address button (mt-4)
- "Create payment link" secondary button (mt-2)

### Settings Screen
- Header with back button
- Grouped list items (mt-4)
- Sections: Security, Network, Preferences
- Logout/Export at bottom (mt-8, danger styling)

---

## Data Display Patterns

**Monetary Amounts:**
- Always right-aligned when in lists
- Include currency symbol
- Muted fiat equivalent below when applicable
- Positive/negative indicated through subtle prefix (+ / -)

**Addresses:**
- Truncated: `0x1234...5678` format (first 6, last 4)
- Full address shown only in dedicated views
- Always with copy button adjacent

**Timestamps:**
- Relative for recent ("2m ago", "1h ago")
- Absolute for older ("Jan 15, 2:30 PM")
- Text-xs, muted

---

## Accessibility

- Minimum tap target: 44x44px (h-12 covers this)
- WCAG AA contrast ratios throughout (system ensures)
- Focus visible on all interactive elements
- Keyboard navigation support for desktop PWA
- Screen reader labels on all icons and actions
- Form fields with proper labels and error states

---

## Images

**No hero images.** This is a utility application requiring instant access.

**QR Codes:** Generated dynamically via library
**Icons:** Heroicons library only
**Illustrations:** None (contradicts minimal approach)
**Photos/Backgrounds:** None

---

## Responsive Behavior

**Mobile-First:** Designed for 360px width minimum
**Tablet:** Same layout, centered max-w-md container
**Desktop:** Max-w-md centered, otherwise identical to mobile
**No responsive grid changes** - single column maintained across all viewports