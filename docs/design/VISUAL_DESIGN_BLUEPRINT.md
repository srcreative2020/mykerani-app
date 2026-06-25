# MYKERANI Visual Design Blueprint

**Status:** DESIGN — AWAITING OWNER APPROVAL
**Date:** 2026-06-26
**Scope:** Presentation layer only — no backend/database/logic changes

---

## 1. DESIGN PHILOSOPHY

MYKERANI is an AI Financial Clerk Assistant ("Kerani Kewangan Digital"). The visual identity must communicate:

- **Trust** — this handles your money; it must feel secure and professional
- **Warmth** — the AI (KERI) is a friendly clerk, not a cold robot
- **Clarity** — non-accountant users must understand everything at a glance
- **Premium** — a paid SaaS product, not a free tool

The guiding principle: **"Cakap. Upload. Sahkan."** (Talk. Upload. Confirm.) — the UI should always guide the user toward these three actions. Every screen should answer: *what can I say, what can I upload, what do I confirm?*

The design language is **Dark Premium SaaS with Green Accents** — a modern fintech aesthetic (similar to Stripe, Linear, or Vercel's dark themes) but with MYKERANI's signature green as the primary accent colour and the KERI mascot providing warmth.

---

## 2. VISUAL LANGUAGE

### 2.1 Core Aesthetic

| Attribute | Value |
|-----------|-------|
| Theme | Dark (primary) with optional light mode |
| Mood | Premium, calm, focused, friendly |
| Density | Comfortable — not cramped, not wasteful |
| Depth | Layered with subtle glass effects and soft shadows |
| Movement | Smooth, purposeful micro-animations (no excessive motion) |
| Identity | Malaysian fintech — Bahasa Melayu labels, English technical terms |

### 2.2 Design Principles

1. **KERI is always present** — the mascot appears in chat, empty states, and onboarding. KERI is the face of the AI.
2. **Green = action** — the primary green is used ONLY for CTAs, active states, and AI suggestions. It must never be used for destructive actions.
3. **Dark = focus** — the dark background reduces eye strain for long financial work sessions and makes the green accent pop.
4. **Cards = containers** — all content lives in cards with subtle borders and glass-like background. No bare content on the canvas.
5. **Conversation first** — the AI chat is the home screen. The dashboard is secondary. MYKERANI is chat-first, not form-first.
6. **Malay-first labels** — UI labels are in Bahasa Melayu. Technical/financial terms may be in English. The AI communicates in Malay.

---

## 3. COLOUR SYSTEM

### 3.1 Primary Palette

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--bg-base` | Base Background | `#0A0F0D` | App background — deepest dark green-black |
| `--bg-surface` | Surface | `#111815` | Card backgrounds, panels |
| `--bg-surface-2` | Surface Elevated | `#16201C` | Hovered cards, dropdowns, modals |
| `--bg-surface-3` | Surface Highest | `#1C2823` | Active items, selected states |
| `--border-subtle` | Border Subtle | `#1F2B26` | Default card borders, dividers |
| `--border-default` | Border Default | `#2A3832` | Input borders, active card borders |
| `--border-strong` | Border Strong | `#3A4A43` | Focused inputs, emphasized borders |

### 3.2 Accent Colours

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--accent-primary` | MYKERANI Green | `#10B981` | Primary CTAs, AI suggestion confirm, active nav |
| `--accent-primary-hover` | Green Hover | `#059669` | Hover state for primary buttons |
| `--accent-primary-muted` | Green Muted | `#064E3B` | Green backgrounds (badges, highlights) |
| `--accent-primary-glow` | Green Glow | `rgba(16,185,129,0.15)` | Glow effects, focus rings |
| `--accent-secondary` | AI Violet | `#8B5CF6` | AI chat bubbles, AI-generated content |
| `--accent-secondary-muted` | Violet Muted | `#4C1D95` | AI badges, AI section backgrounds |

### 3.3 Semantic Colours

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--semantic-success` | Success | `#22C55E` | Success toasts, positive metrics |
| `--semantic-warning` | Warning | `#F59E0B` | Amber alerts, overdue items |
| `--semantic-danger` | Danger | `#EF4444` | Delete actions, negative metrics |
| `--semantic-info` | Info | `#3B82F6` | Info toasts, informational badges |

### 3.4 Text Colours

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--text-primary` | Text Primary | `#F0FDF4` | Headlines, primary content (near-white with green tint) |
| `--text-secondary` | Text Secondary | `#A7B3AE` | Body text, descriptions |
| `--text-tertiary` | Text Tertiary | `#6B7872` | Placeholders, metadata, timestamps |
| `--text-disabled` | Text Disabled | `#4A544F` | Disabled states |

### 3.5 Usage Rules

- Green (`#10B981`) is reserved for: primary buttons, AI confirm actions, active navigation items, positive financial amounts, success states
- Violet (`#8B5CF6`) is reserved for: AI chat bubbles (AI side), AI suggestion cards, AI-generated content backgrounds
- Red (`#EF4444`) is reserved for: delete buttons, negative amounts, danger zones, error states
- Amber (`#F59E0B`) is reserved for: warnings, overdue indicators, incomplete states
- Blue (`#3B82F6`) is reserved for: info badges, external links, support tickets
- **Never** use green for destructive actions
- **Never** use red for primary CTAs

---

## 4. TYPOGRAPHY SYSTEM

### 4.1 Font Family

| Usage | Font | Fallback | Reason |
|-------|------|----------|--------|
| Display/Headlines | `Inter` | `system-ui, -apple-system, sans-serif` | Modern SaaS standard, excellent legibility at all sizes |
| Body Text | `Inter` | `system-ui, sans-serif` | Consistent with headlines |
| Numbers/Financial | `Inter` with `tabular-nums` | `monospace` | Tabular numbers align in tables and financial displays |
| Code/Technical | `JetBrains Mono` | `monospace` | For API keys, IDs, technical values |

### 4.2 Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-display` | 32px | 800 | 1.15 | Landing page hero, login headline |
| `--text-h1` | 24px | 700 | 1.25 | Page titles, modal titles |
| `--text-h2` | 20px | 700 | 1.3 | Section titles within a page |
| `--text-h3` | 16px | 600 | 1.4 | Card titles, list item titles |
| `--text-body` | 14px | 400 | 1.5 | Default body text, descriptions |
| `--text-body-sm` | 13px | 400 | 1.5 | Secondary descriptions, table cells |
| `--text-caption` | 12px | 500 | 1.4 | Labels, badges, metadata |
| `--text-micro` | 11px | 600 | 1.3 | Overline labels, uppercase tags |

### 4.3 Usage Rules

- Financial amounts use `tabular-nums` and weight 700 for emphasis
- Labels above inputs use `--text-caption` (12px, weight 500, `--text-tertiary`)
- Malay text and English technical terms coexist without visual distinction
- Numbers are right-aligned in tables, left-aligned in cards
- Never use italics for UI text (only for AI chat natural language emphasis)

---

## 5. GRID SYSTEM

### 5.1 Breakpoints

| Token | Min Width | Max Width | Columns | Gutter | Usage |
|-------|-----------|-----------|---------|--------|-------|
| `mobile` | 0 | 639px | 4 | 16px | Phone portrait |
| `tablet` | 640px | 1023px | 8 | 20px | Tablet / small laptop |
| `desktop` | 1024px | 1279px | 12 | 24px | Standard laptop |
| `wide` | 1280px | ∞ | 12 | 32px | Desktop monitor |

### 5.2 Container

| Breakpoint | Max Content Width | Side Padding |
|------------|------------------|-------------|
| Mobile | 100% | 16px |
| Tablet | 100% | 24px |
| Desktop | 1200px | 32px |
| Wide | 1280px | 32px |

### 5.3 Grid Rules

- Financial dashboard uses a 12-column grid on desktop
- AI chat is always full-width (no grid columns) — conversation is the focus
- Cards within a dashboard use `grid-cols: repeat(auto-fill, minmax(280px, 1fr))`
- Forms use a single column on mobile, 2 columns on tablet+, max 600px form width
- Modals are max 500px wide on mobile (nearly full-screen), 600px on tablet+

---

## 6. SPACING SYSTEM

### 6.1 Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | No spacing |
| `--space-1` | 4px | Tight gaps (icon to text) |
| `--space-2` | 8px | Small gaps (badge padding, list items) |
| `--space-3` | 12px | Default small (card inner padding top/bottom on mobile) |
| `--space-4` | 16px | Default (card inner padding, gap between fields) |
| `--space-5` | 20px | Medium (gap between cards in a grid) |
| `--space-6` | 24px | Large (section spacing, card inner padding on desktop) |
| `--space-8` | 32px | Section spacing (between major page sections) |
| `--space-10` | 40px | Page top/bottom padding |
| `--space-12` | 48px | Hero section spacing |

### 6.2 Component Padding

| Component | Mobile | Desktop |
|-----------|--------|---------|
| Card | 12px 16px | 16px 24px |
| Modal | 16px | 24px |
| Nav item | 12px 16px | 12px 20px |
| Input | 10px 14px | 12px 16px |
| Button | 10px 16px | 12px 20px |
| Page | 16px | 24px 32px |

---

## 7. BORDER RADIUS

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 8px | Badges, small inline elements, tags |
| `--radius-md` | 12px | Buttons, inputs, dropdown items |
| `--radius-lg` | 16px | Cards, panels, chat bubbles |
| `--radius-xl` | 20px | Modals, large cards, dashboard tiles |
| `--radius-full` | 9999px | Avatars, circular icons, pill buttons |

### 7.1 Rules

- Cards always use `--radius-lg` (16px)
- Buttons and inputs always use `--radius-md` (12px)
- AI chat bubbles use `--radius-lg` (16px) with one corner sharp (the side facing the speaker)
- Modals use `--radius-xl` (20px)
- Never mix radius sizes within the same component group

---

## 8. SHADOWS

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-none` | none | Flat surfaces |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Subtle elevation — dropdowns |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Cards at rest |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Hovered cards, popovers |
| `--shadow-xl` | `0 16px 48px rgba(0,0,0,0.6)` | Modals, overlays |
| `--shadow-glow` | `0 0 24px rgba(16,185,129,0.15)` | AI suggestion cards, active green elements |

### 8.1 Rules

- Dark theme shadows use higher opacity (0.3-0.6) because the background is already dark
- AI suggestion cards get a subtle green glow (`--shadow-glow`) to distinguish them from regular cards
- Modals and overlays use `--shadow-xl` for maximum separation from the background
- Hovered cards transition from `--shadow-md` to `--shadow-lg` smoothly

---

## 9. GLASS EFFECT

### 9.1 Definition

The glass effect (glassmorphism) is used sparingly to create depth and layering. It is NOT applied to every surface — only to elements that float above content.

### 9.2 Glass Tokens

| Token | Background | Border | Blur | Usage |
|-------|-----------|--------|------|-------|
| `--glass-panel` | `rgba(17,24,21,0.8)` | `1px solid rgba(42,56,50,0.6)` | `backdrop-filter: blur(12px)` | Sticky headers, floating toolbars |
| `--glass-card` | `rgba(22,32,28,0.7)` | `1px solid rgba(31,43,38,0.5)` | `backdrop-filter: blur(8px)` | AI suggestion cards (overlaying chat) |
| `--glass-modal` | `rgba(28,40,35,0.9)` | `1px solid rgba(42,56,50,0.8)` | `backdrop-filter: blur(20px)` | Modals, dialogs |

### 9.3 Rules

- Glass is used ONLY on: sticky headers, floating toolbars, AI suggestion cards, modals
- Glass is NOT used on: regular cards, page sections, list items, inputs
- The blur must always be paired with a semi-transparent background — never blur alone
- On mobile, glass effects are reduced (lower blur) for performance

---

## 10. ICON STYLE

### 10.1 Icon Library

| Usage | Library | Style |
|-------|---------|-------|
| UI Icons | `lucide-react` (already in use) | Outline, 1.5px stroke |
| Financial Icons | `lucide-react` (Banknote, TrendingUp, etc.) | Same as UI |
| Custom Icons | Placeholder `[ICON_SET]` | To be provided by Owner |

### 10.2 Icon Sizes

| Token | Size | Usage |
|-------|------|-------|
| `--icon-sm` | 16px | Inline icons, table cell icons |
| `--icon-md` | 20px | Default — nav items, buttons, card headers |
| `--icon-lg` | 24px | Empty state icons, feature highlights |
| `--icon-xl` | 32px | Onboarding, large feature cards |

### 10.3 Icon Colours

| Context | Colour |
|---------|--------|
| Default | `--text-secondary` (#A7B3AE) |
| Active/Selected | `--accent-primary` (#10B981) |
| Destructive | `--semantic-danger` (#EF4444) |
| AI-related | `--accent-secondary` (#8B5CF6) |
| Input prefix | `--text-tertiary` (#6B7872) |

### 10.4 Rules

- Icons are always paired with text labels in navigation and buttons
- Icon-only buttons must have `aria-label` and tooltip
- Financial category icons use a consistent colour: `--text-secondary` at rest, `--accent-primary` when active
- Never use filled/solid icons — outline only (lucide-react default)

---

## 11. ILLUSTRATION PLACEMENT RULES

### 11.1 Illustration Usage

Illustrations are used ONLY in:
- **Empty states** — when a section has no data (no transactions, no documents, no businesses)
- **Onboarding wizard** — step-by-step first-run experience
- **Landing page** — hero section and feature highlights
- **Error states** — friendly error illustrations (not scary)

### 11.2 Illustration Placeholder

All illustrations are placeholders until the Owner provides official assets:

```
[ILLUSTRATION: empty_transactions]
[ILLUSTRATION: empty_documents]
[ILLUSTRATION: onboarding_welcome]
[ILLUSTRATION: onboarding_upload]
[ILLUSTRATION: onboarding_confirm]
[ILLUSTRATION: error_generic]
[ILLUSTRATION: error_connection]
[ILLUSTRATION: landing_hero]
```

### 11.3 Illustration Style Rules

- Illustrations must use the MYKERANI colour palette (greens, dark surface, violet for AI)
- Style: flat with subtle gradients, friendly and approachable (not corporate)
- KERI mascot may appear in illustrations for empty states
- Illustrations are decorative — they never convey critical information alone
- Size: 120x120px for empty states, 200x200px for onboarding, 400x300px for landing hero

---

## 12. LOGO PLACEMENT RULES

### 12.1 Logo Placeholder

```
[MYKERANI_LOGO]
```

### 12.2 Logo Usage

| Location | Size | Variant |
|---------|------|---------|
| Landing page header | 140px wide | Full logo (wordmark + icon) |
| Login screen | 120px wide | Full logo, centered |
| App header (desktop) | 32px height | Icon mark only (compact) |
| App header (mobile) | 28px height | Icon mark only |
| Sidebar footer | 100px wide | Full logo, muted opacity |
| Loading screen | 80px height | Icon mark, centered with pulse animation |
| Favicon | 32x32px | Icon mark only |

### 12.3 Rules

- The logo is always on a dark background — never place on white/light
- The logo green must match `--accent-primary` (#10B981)
- Minimum clear space: logo height on all sides
- Never stretch, rotate, or recolour the logo
- The icon mark (without wordmark) is used when space is limited (headers, favicons)

---

## 13. MASCOT PLACEMENT RULES

### 13.1 KERI Mascot Placeholder

```
[KERI_MASCOT]
```

### 13.2 KERI Usage

| Location | Size | Expression |
|---------|------|------------|
| AI Chat (welcome) | 64px | Friendly, waving |
| AI Chat (typing) | 32px | Thinking, looking up |
| Empty state (no data) | 80px | Encouraging, pointing to CTA |
| Onboarding step 1 | 120px | Welcoming, arms open |
| Login screen | 96px | Friendly, beside logo |
| Loading screen | 64px | Working, with gear/clipboard |
| Error state | 64px | Concerned, helpful |
| Notification (AI suggestion) | 24px | Small avatar in notification badge |

### 13.3 Rules

- KERI is always friendly and approachable — never stern or robotic
- KERI appears in AI contexts only (chat, suggestions, AI-related empty states)
- KERI does NOT appear in: settings, billing, HQ admin, audit logs (those are system/financial, not AI)
- KERI's colour palette matches the app: dark body/green accents
- KERI expressions change based on context: welcome, thinking, success, concern
- On mobile, KERI is smaller (50% of desktop size) to save screen space

---

## 14. CARD SYSTEM

### 14.1 Card Anatomy

```
┌──────────────────────────────────────────┐
│  ┌─────┐  Card Title          [Action]   │  ← Header (icon + title + optional action)
│  │Icon │  Subtitle text                   │
│  └─────┘                                  │
├──────────────────────────────────────────┤
│                                          │
│  Card Content Area                       │  ← Body (data, forms, lists)
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  Footer text / metadata / secondary action│  ← Footer (optional)
└──────────────────────────────────────────┘
```

### 14.2 Card Variants

| Variant | Background | Border | Shadow | Usage |
|---------|-----------|--------|--------|-------|
| Default | `--bg-surface` (#111815) | `--border-subtle` | `--shadow-md` | Standard content cards |
| Elevated | `--bg-surface-2` (#16201C) | `--border-default` | `--shadow-lg` | Hovered, expanded, active |
| Glass | `--glass-card` | glass border | `--shadow-md` | AI suggestion cards, floating panels |
| Highlight | `--bg-surface` + green left border (3px) | `--border-subtle` | `--shadow-glow` | AI suggestion cards (active) |
| Danger | `--bg-surface` + red left border (3px) | `--border-subtle` | `--shadow-md` | Delete confirmations, danger zones |
| Metric | `--bg-surface` | `--border-subtle` | `--shadow-md` | Dashboard metric tiles (number + label) |

### 14.3 Card Rules

- All cards use `--radius-lg` (16px)
- Card padding: 12px 16px (mobile), 16px 24px (desktop)
- Cards have a 1px border — never borderless
- Hover state: elevate from `--shadow-md` to `--shadow-lg` + border shifts to `--border-default`
- AI suggestion cards have a green glow and violet-tinted background
- Metric cards display a large number (24px, weight 700) + small label (12px, `--text-tertiary`)
- Cards in a grid have equal height (flex or grid alignment)

---

## 15. DASHBOARD LAYOUT

### 15.1 Layout Structure (Tenant Owner)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [LOGO]  MYKERANI     [Workspace ▾]  [🔔]  [Avatar ▾]                   │  ← Sticky Header (glass)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  [KERI]  "Selamat datang! Apa yang anda ingin buat hari ini?"      │ │  ← AI Greeting Card
│  │         [Cakap]  [Upload]  [Sahkan]                                 │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Pendapatan   │  │  Perbelanjaan│  │  Baki Bank   │  │  Kesihatan   │ │  ← Metric Tiles (4 cols on desktop)
│  │  RM 12,500    │  │  RM 8,300    │  │  RM 45,000   │  │  STABIL      │ │
│  │  +15%         │  │  -5%         │  │  3 akaun     │  │  72%         │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                          │
│  ┌──────────────────────────────────────┐  ┌──────────────────────────┐ │
│  │  Transaksi Terkini                    │  │  KERI Cadangan           │ │  ← Recent Activity + AI Suggestions
│  │  ┌─────────────────────────────────┐ │  │  ┌────────────────────┐ │ │
│  │  │  🟢 Pendapatan  RM 500  Hari ini│ │  │  │ [KERI] Anda ada 3  │ │ │
│  │  │  🔴 Perbelanjaan RM 50  Semalam │ │  │  │ cadangan untuk      │ │ │
│  │  │  🟡 Belum Terima RM 1,200       │ │  │  │ disahkan.           │ │ │
│  │  └─────────────────────────────────┘ │  │  └────────────────────┘ │ │
│  └──────────────────────────────────────┘  └──────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Storage Bar  ████████░░░░  68%  (8.5GB / 12.5GB)                  │ │  ← Storage Indicator
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ─── Bottom Nav (Mobile) ───                                            │
│  [🏠 Home]  [📊 Dashboard]  [📁 Dokumen]  [📋 Laporan]  [☰ Lagi]       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 15.2 Visual Hierarchy

1. **AI Greeting** (top, full width) — KERI + welcome message + 3 quick action buttons
2. **Metric Tiles** (4 across on desktop, 2x2 on tablet, stacked on mobile) — key financial numbers
3. **Recent Activity** (left 2/3) + **AI Suggestions** (right 1/3) — primary content area
4. **Storage Indicator** (bottom, full width) — resource awareness
5. **Bottom Nav** (mobile only) — fixed navigation

### 15.3 Responsive Behaviour

| Device | Layout |
|--------|--------|
| Desktop (1024px+) | 12-column grid, 4 metric tiles in a row, 2-column content area (2/3 + 1/3) |
| Tablet (640-1023px) | 8-column grid, 2x2 metric tiles, single column content, sidebar collapses |
| Mobile (<640px) | Single column, stacked metric tiles, bottom nav, AI greeting is compact |

---

## 16. LANDING PAGE LAYOUT

### 16.1 Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [MYKERANI_LOGO]  MYKERANI                        [Log Masuk]            │  ← Header (transparent → solid on scroll)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│              [ILLUSTRATION: landing_hero]                                │
│                                                                          │
│         "Cakap. Upload. Sahkan."                                         │  ← Hero Headline
│         AI Financial Clerk untuk PKS Malaysia                            │  ← Hero Subtitle
│                                                                          │
│         [Mula Percuma]  [Lihat Demo]                                    │  ← CTAs
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ [ICON] Cakap │  │[ICON] Upload │  │[ICON] Sahkan │                   │  ← 3 Pillars
│  │ Berbual       │  │ Muat naik    │  │ Sahkan       │                   │
│  │ dengan KERI   │  │ resit/inbois │  │ cadangan AI  │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Feature: AI Chat Preview                                           │ │  ← Feature Section 1
│  │  [Screenshot of chat interface]                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Feature: OCR & Document Processing                                 │ │  ← Feature Section 2
│  │  [Screenshot of document upload]                                    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Feature: Financial Reports                                         │ │  ← Feature Section 3
│  │  [Screenshot of reports dashboard]                                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Pricing: 3 Plans (Trial, Starter, Growth)                          │ │  ← Pricing Section
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  FAQ                                                                 │ │  ← FAQ Section
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  [MYKERANI_LOGO]  MYKERANI  © 2026  |  Links                        │ │  ← Footer
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Visual Hierarchy

1. **Hero** — headline + subtitle + CTAs + illustration (centered, full viewport height)
2. **3 Pillars** — Cakap / Upload / Sahkan (the formula, visualized)
3. **Feature Sections** — alternating left/right screenshot + text
4. **Pricing** — 3 plan cards, middle plan highlighted
5. **FAQ** — accordion
6. **Footer** — logo, links, copyright

### 16.3 Responsive Behaviour

| Device | Layout |
|--------|--------|
| Desktop | Full hero, 3 pillars in a row, feature sections side-by-side, 3 pricing cards |
| Tablet | Full hero, 3 pillars in a row, feature sections stacked, pricing cards in a row |
| Mobile | Compact hero, pillars stacked, feature sections stacked, pricing stacked, hamburger nav |

---

## 17. LOGIN LAYOUT

### 17.1 Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                          [MYKERANI_LOGO]                                 │
│                                                                          │
│                         [KERI_MASCOT]                                    │
│                                                                          │
│                    "Selamat datang kembali!"                              │  ← Headline
│                   "Log masuk ke akaun anda"                              │  ← Subtitle
│                                                                          │
│              ┌──────────────────────────────────────┐                    │
│              │  📧  Email                            │                    │  ← Email Input
│              └──────────────────────────────────────┘                    │
│              ┌──────────────────────────────────────┐                    │
│              │  🔒  Kata Laluan                      │                    │  ← Password Input
│              └──────────────────────────────────────┘                    │
│                                                                          │
│              ┌──────────────────────────────────────┐                    │
│              │           [Log Masuk]                 │                    │  ← Primary CTA (green)
│              └──────────────────────────────────────┘                    │
│                                                                          │
│                   Lupa kata laluan?                                      │  ← Secondary link
│                                                                          │
│              ── atau ──                                                  │
│                                                                          │
│         [Demo Owner]  [Demo Staff]  [Demo HQ]                           │  ← Demo buttons (for UAT)
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 17.2 Visual Hierarchy

1. **Logo** (top center) — brand identity
2. **KERI** (below logo) — mascot welcoming the user
3. **Headline + Subtitle** — Malay greeting
4. **Email + Password** — single column form, centered, max 400px
5. **Login Button** — full width, green primary
6. **Demo buttons** — for UAT testing, subtle/secondary style

### 17.3 Responsive Behaviour

| Device | Layout |
|--------|--------|
| Desktop | Centered card on dark background, max 400px width, KERI at 96px |
| Tablet | Same as desktop, slightly larger touch targets |
| Mobile | Full width with 24px padding, KERI at 64px, demo buttons stack vertically |

---

## 18. HQ LAYOUT

### 18.1 Structure (HQ Owner / HQ Staff)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [LOGO]  HQ Console    [🔔 3]  [Avatar ▾]                                │  ← Header
├──────────┬───────────────────────────────────────────────────────────────┤
│          │                                                               │
│  📊      │  ┌─────────────────────────────────────────────────────────┐ │
│  Dashboard│ │  Command Center — KERI Briefing                          │ │  ← Active Page
│          │ │  "3 pelanggan berisiko, 2 tiket sokongan terbuka..."     │ │
│  👥      │ └─────────────────────────────────────────────────────────┘ │
│  Customers│                                                               │
│          │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  💳      │  │ Tenants  │  │  MRR     │  │  Tickets  │  │  Alerts  │    │  ← Metric Row
│  Billing │  │   142    │  │  RM 45k  │  │    7      │  │    3     │    │
│          │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  🎫      │                                                               │
│  Support │  ┌─────────────────────────────────────────────────────────┐ │
│          │  │  Customer Table                                          │ │
│  🤖      │  │  Name | Plan | Health | MRR | Status | Actions          │ │  ← Data Table
│  AI Router│ └─────────────────────────────────────────────────────────┘ │
│          │                                                               │
│  ⚙️      │                                                               │
│  Settings│                                                               │
│          │                                                               │
│  ─── HQ Nav (Owner) ───                                                 │
│  Dashboard, Customers, Billing, Support, AI Router,                     │
│  Subscriptions, Revenue, Website, Settings, Governance,                 │
│  Approval Center, Activity Center, Cost Center, Knowledge               │
│          │                                                               │
├──────────┴───────────────────────────────────────────────────────────────┤
│  ─── Bottom Nav (Mobile) ───                                            │
│  [🏠]  [👥]  [🎫]  [⚙️]  [☰]                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 18.2 Visual Hierarchy

1. **Sidebar** (left, fixed on desktop, drawer on mobile) — navigation with 14+ items
2. **Header** — notifications + avatar
3. **Page Content** — KERI briefing card → metric tiles → data table
4. **KERI Briefing** — natural language summary of system status (HQ Owner only)

### 18.3 HQ vs Tenant Differences

| Aspect | HQ | Tenant |
|--------|-----|--------|
| Sidebar items | 14+ (Dashboard, Customers, Billing, Support, AI Router, etc.) | 5 (Home, Dashboard, Documents, Reports, More) |
| KERI briefing | System status summary | Personal financial summary |
| Metric tiles | Tenants, MRR, Tickets, Alerts | Income, Expense, Bank Balance, Health |
| Primary colour accent | Same green (#10B981) | Same green (#10B981) |
| KERI presence | In briefing only | In chat, suggestions, empty states |

### 18.4 Responsive Behaviour

| Device | Layout |
|--------|--------|
| Desktop | Fixed sidebar 240px, content area fills remaining |
| Tablet | Collapsible sidebar (overlay drawer), content full width |
| Mobile | No sidebar, bottom nav with 5 items + "More" for full menu |

---

## 19. TENANT LAYOUT

### 19.1 Structure (Tenant Owner — Primary Product)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [LOGO]  [Workspace: LemonTree Bakery ▾]  [🔔 2]  [Avatar ▾]            │  ← Header (glass)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  [Tab: Home] [Tab: Dashboard] [Tab: Dokumen] [Tab: Laporan] [☰] │    │  ← Tab Bar
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ── HOME TAB (AI Chat — primary) ──                                      │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  [KERI 32px]  AI chat area (scrollable)                          │    │
│  │                                                                  │    │
│  │  User: "Saya jual kuih RM 200 tadi"                              │    │  ← User bubble (right, surface-2)
│  │                                                                  │    │
│  │       [KERI] Cadangan: [Violet glass card]                      │    │  ← AI bubble (left, violet tint)
│  │       Pendapatan RM 200                                          │    │
│  │       Kategori: Jualan                                           │    │
│  │       [Sahkan]  [Edit]  [Tolak]                                  │    │
│  │                                                                  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  [📎]  [🎤]  Type message...                         [Send →]   │    │  ← Chat Input (glass, sticky)
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ── Bottom Nav (Mobile) ──                                              │
│  [🏠 Home]  [📊 Dashboard]  [📁 Dokumen]  [📋 Laporan]  [☰ Lagi]       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 19.2 Tab Structure

| Tab | Content | Icon | Priority |
|-----|---------|------|----------|
| Home (mykerani) | AI Chat — primary screen | MessageCircle | 1 (default) |
| Dashboard | Financial overview + metrics + transaction list | LayoutDashboard | 2 |
| Dokumen | Documents Manager (OCR, evidence) | FolderOpen | 3 |
| Laporan | Financial Reports (P&L, BS, CF, Health) | FileBarChart | 4 (Owner only) |
| Lagi (More) | Settings, Profile, Team, Billing, Support, Activity | Menu | 5 |

### 19.3 Tenant Staff Differences

Staff sees the same layout but:
- No "Laporan" tab (reports are Owner-only)
- "Lagi" has fewer items (no Team, no Billing)
- AI chat suggestions still appear but Staff confirms → Owner is notified
- Resource status card (AI/OCR credits) is visible

### 19.4 Responsive Behaviour

| Device | Layout |
|--------|--------|
| Desktop | Tabs as horizontal bar, chat area max 800px centered, side panel for suggestions on wide screens |
| Tablet | Tabs as horizontal bar, chat full width, bottom nav hidden |
| Mobile | Tabs collapse to bottom nav (5 items), chat full width, compact KERI |

---

## 20. MOBILE LAYOUT

### 20.1 Mobile Design Principles

1. **Bottom nav is primary navigation** — thumb-friendly, 5 items max
2. **Chat is full screen** — no sidebar, no secondary panels
3. **Cards stack vertically** — no multi-column grids
4. **Forms are single column** — one field per row
5. **KERI is smaller** — 32px in chat, 48px in empty states
6. **Touch targets minimum 44px** — for accessibility
7. **Sticky chat input** — always visible at bottom, never hidden by keyboard

### 20.2 Mobile Screen Structure

```
┌──────────────────────────────┐
│ [Logo] [WS ▾]    [🔔] [👤]   │  ← Header (44px, glass, sticky)
├──────────────────────────────┤
│                              │
│  Content Area                │  ← Scrollable (calc(100vh - 44px - 60px))
│  (fills remaining space)     │
│                              │
│                              │
│                              │
├──────────────────────────────┤
│ [🏠] [📊] [📁] [📋] [☰]    │  ← Bottom Nav (60px, glass, fixed)
└──────────────────────────────┘
```

### 20.3 Mobile Chat Layout

```
┌──────────────────────────────┐
│ [Logo] LemonTree Bakery  [🔔]│  ← Header
├──────────────────────────────┤
│  [KERI] Selamat pagi!        │  ← AI greeting (compact)
│                              │
│        "Jual kuih RM 200"    │  ← User message (right-aligned)
│                              │
│  [KERI] Cadangan:            │  ← AI suggestion (left, violet glass)
│  ┌──────────────────────────┐│
│  │ Pendapatan RM 200        ││
│  │ Jualan                   ││
│  │ [✅ Sahkan] [✏️] [❌]   ││  ← Suggestion actions (full width)
│  └──────────────────────────┘│
│                              │
├──────────────────────────────┤
│ [📎] [🎤] Message... [Send]  │  ← Chat input (sticky, glass)
└──────────────────────────────┘
```

---

## 21. DESKTOP LAYOUT

### 21.1 Desktop Design Principles

1. **Side navigation** for HQ (240px sidebar), **tab bar** for Tenant
2. **Multi-column grids** for dashboards (4 metric tiles, 2/3 + 1/3 content split)
3. **Hover states** are meaningful — cards elevate, buttons shift colour
4. **Keyboard navigation** — all interactive elements focusable with visible focus rings
5. **Chat area max 800px** centered — conversation remains focused even on wide screens
6. **Tooltips** on icon-only buttons and truncated text

### 21.2 Desktop Screen Structure (Tenant)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo 32px]  [Workspace: LemonTree Bakery ▾]     [🔔 2]  [Avatar ▾]   │  ← Header (64px, glass, sticky)
├──────────────────────────────────────────────────────────────────────────┤
│  [Home] [Dashboard] [Dokumen] [Laporan]                          [☰ Lagi] │  ← Tab Bar (48px)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────┐  ┌──────────────────────────┐ │
│  │  AI Chat (max 800px)                 │  │  Side Panel (optional)   │ │
│  │                                      │  │  Suggestions, quick      │ │
│  │  [KERI] + conversation               │  │  stats, storage bar      │ │
│  │                                      │  │  (only on wide screens)  │ │
│  │  [📎] [🎤] Type... [Send]            │  │                          │ │
│  └──────────────────────────────────────┘  └──────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 21.3 Desktop Screen Structure (HQ)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo]  HQ Console                              [🔔 3]  [Avatar ▾]     │  ← Header (64px)
├────────────┬─────────────────────────────────────────────────────────────┤
│            │                                                             │
│  Sidebar   │  Page Content (fills remaining width)                       │
│  (240px)   │                                                             │
│            │  ┌─────────────────────────────────────────────────────────┐│
│  📊 Dash   │  │  KERI Briefing                                        ││
│  👥 Cust   │  └─────────────────────────────────────────────────────────┘│
│  💳 Bill   │                                                             │
│  🎫 Sup    │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                      │
│  🤖 AI     │  │Metric│ │Metric│ │Metric│ │Metric│                      │
│  📦 Sub    │  └──────┘ └──────┘ └──────┘ └──────┘                      │
│  💰 Rev    │                                                             │
│  🌐 Web    │  ┌─────────────────────────────────────────────────────────┐│
│  ⚙️ Set    │  │  Data Table                                           ││
│  ⚖️ Gov    │  └─────────────────────────────────────────────────────────┘│
│  ✅ App    │                                                             │
│  📋 Act    │                                                             │
│  💵 Cost   │                                                             │
│  📚 Know   │                                                             │
│            │                                                             │
├────────────┴─────────────────────────────────────────────────────────────┤
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 22. TABLET LAYOUT

### 22.1 Tablet Design Principles

1. **Sidebar collapses to drawer** (HQ) or **tab bar remains** (Tenant)
2. **2-column grids** for metrics (2x2)
3. **Content is single column** — no side panels
4. **Touch targets minimum 44px**
5. **Chat is full width** — no side panel for suggestions
6. **Bottom nav hidden** on tablet — tab bar is sufficient

### 22.2 Tablet Screen Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Logo]  [Workspace ▾]                              [🔔]  [Avatar ▾]   │  ← Header (56px)
├──────────────────────────────────────────────────────────────────────────┤
│  [Home] [Dashboard] [Dokumen] [Laporan]                          [☰ Lagi] │  ← Tab Bar (48px)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐                                    │
│  │  Metric 1    │  │  Metric 2    │                                    │  ← 2-column metrics
│  └──────────────┘  └──────────────┘                                    │
│  ┌──────────────┐  ┌──────────────┐                                    │
│  │  Metric 3    │  │  Metric 4    │                                    │
│  └──────────────┘  └──────────────┘                                    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │  AI Chat (full width)                                                ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │  [📎] [🎤] Type message...                              [Send →]   ││  ← Chat input (sticky)
│  └──────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 23. RESPONSIVE RULES

### 23.1 Breakpoint Behaviour Summary

| Element | Mobile (<640px) | Tablet (640-1023px) | Desktop (1024px+) | Wide (1280px+) |
|---------|-----------------|---------------------|--------------------|----|
| Header | 44px, compact | 56px | 64px | 64px |
| Navigation | Bottom nav (5 items) | Tab bar | Tab bar + sidebar (HQ) | Same as desktop |
| Metric tiles | 1 column (stacked) | 2x2 grid | 4 in a row | 4 in a row, wider |
| AI Chat | Full width | Full width | Max 800px centered | Max 800px + side panel |
| Cards | Full width, stacked | Full width or 2-col | Multi-column grid | Multi-column grid |
| KERI | 32px (chat), 48px (empty) | 48px, 64px | 64px, 80px | Same as desktop |
| Font sizes | Base 13px | Base 14px | Base 14px | Base 14px |
| Touch targets | 44px min | 44px min | 36px min | 36px min |
| Glass blur | 8px (reduced) | 12px | 12px | 12px |

### 23.2 Responsive Rules

1. **Mobile-first CSS** — base styles target mobile, `@media (min-width)` upgrades for larger screens
2. **No horizontal scroll** — all content fits within the viewport at every breakpoint
3. **Images/illustrations scale** — `max-width: 100%; height: auto`
4. **Tables become cards on mobile** — data tables transform to stacked card layouts
5. **Modals become full-screen on mobile** — `border-radius` reduces to 12px, padding increases
6. **Sidebar becomes drawer on tablet** (HQ) — hamburger toggle, overlay backdrop
7. **Bottom nav appears only on mobile** — hidden at 640px+
8. **Tab bar hidden on mobile** — replaced by bottom nav
9. **Chat input is always sticky** — never scrolls out of view
10. **Touch vs hover** — hover states only apply at 1024px+ (pointer: fine)

---

## 24. ANIMATION RULES

### 24.1 Animation Tokens

| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `--anim-fast` | 150ms | `ease-out` | Button presses, toggles, small state changes |
| `--anim-default` | 250ms | `ease` | Card hover, dropdown open, tab switch |
| `--anim-slow` | 400ms | `ease-in-out` | Modal open/close, page transitions |
| `--anim-spring` | 300ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` | KERI appearance, suggestion card pop-in |

### 24.2 Animation Rules

1. **KERI appears with a spring bounce** — the mascot gently bounces when it appears in chat
2. **AI suggestion cards slide up + fade in** — `transform: translateY(8px) → 0; opacity: 0 → 1`
3. **Cards elevate on hover** — `transform: translateY(-2px)` + shadow transition
4. **Tab switches fade** — old tab content fades out (150ms), new content fades in (150ms)
5. **Modals scale in** — `transform: scale(0.95) → 1; opacity: 0 → 1` over 400ms
6. **Loading skeletons shimmer** — `background: linear-gradient(90deg, surface → surface-2 → surface)` infinite
7. **Numbers count up** — financial metrics animate from 0 to value on first load (300ms)
8. **Bottom nav active indicator slides** — a green dot slides between active items
9. **Chat messages slide in from bottom** — `transform: translateY(12px) → 0`
10. **No animations respect `prefers-reduced-motion`** — when set, all animations are instant

### 24.3 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 25. EMPTY STATE DESIGN

### 25.1 Empty State Anatomy

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    [ILLUSTRATION: empty_*]                       │  ← Illustration (120x120)
│                                                                  │
│                    [KERI_MASCOT 48px]                            │  ← KERI (optional, for AI contexts)
│                                                                  │
│              "Belum ada transaksi lagi"                          │  ← Headline (h3, text-primary)
│         "Cakap dengan KERI atau upload resit                     │  ← Description (body, text-secondary)
│           untuk mula merekod kewangan anda"                     │
│                                                                  │
│              [Mula Cakap dengan KERI]                            │  ← CTA (green primary button)
│              atau                                                │
│              [Upload Dokumen]                                    │  ← Secondary CTA (ghost button)
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 25.2 Empty State Variants

| Context | Illustration | KERI? | Headline | CTA |
|---------|-------------|-------|----------|-----|
| No transactions | `empty_transactions` | ✅ | "Belum ada transaksi" | "Mula Cakap" / "Upload Resit" |
| No documents | `empty_documents` | ❌ | "Belum ada dokumen" | "Upload Dokumen" |
| No businesses | `empty_businesses` | ❌ | "Tambah perniagaan pertama anda" | "Tambah Perniagaan" |
| No chat history | `empty_chat` | ✅ | "Mula bercakap dengan KERI" | "Cakap Sekarang" |
| No reports | `empty_reports` | ❌ | "Belum ada laporan tersedia" | "Tambah Data Kewangan" |
| No support tickets | `empty_tickets` | ❌ | "Tiada tiket sokongan" | "Buka Tiket" |
| No activity | `empty_activity` | ❌ | "Tiada aktiviti direkodkan" | (none) |

### 25.3 Rules

- Empty states are centered vertically and horizontally in their container
- Illustration is decorative — the headline + CTA carry the message
- KERI appears in AI-related empty states (chat, transactions) but not in system empty states (settings, audit)
- The CTA is always green (primary) — it's the next action the user should take
- Empty states never feel like errors — they feel like invitations

---

## 26. LOADING STATE

### 26.1 Loading Patterns

| Pattern | Usage | Visual |
|---------|-------|--------|
| Skeleton | Card content, list items, table rows | Shimmering grey blocks matching content shape |
| Spinner | Button loading, small inline actions | 16px circular spinner, green stroke |
| KERI Thinking | AI chat loading | KERI 32px with "thinking" expression + 3 animated dots |
| Progress Bar | File upload, batch operations | Green bar filling left-to-right |
| Page Loader | Initial app load | Centered [MYKERANI_LOGO] with pulse animation |

### 26.2 Skeleton Design

```
┌──────────────────────────────────────────┐
│  ████████████  ████████                  │  ← Title skeleton (shimmer)
│  ████████████                            │
│                                          │
│  ┌──────────┐  ┌──────────┐             │  ← Card skeleton
│  │ ████████ │  │ ████████ │             │
│  │ ████████ │  │ ████████ │             │
│  └──────────┘  └──────────┘             │
└──────────────────────────────────────────┘
```

Skeleton colour: `--bg-surface-2` (#16201C) base with shimmer gradient to `--bg-surface-3` (#1C2823).

### 26.3 Rules

- Skeletons match the shape of the content that will load (not generic spinners for card content)
- AI chat loading shows KERI thinking — this is the ONLY place KERI animates during loading
- Button loading replaces text with a 16px spinner (same colour as text)
- Page loader uses the logo with a CSS pulse (scale 1.0 → 1.05 → 1.0, 1.5s infinite)
- Loading states must never flash — minimum 200ms before showing (avoid flicker on fast loads)

---

## 27. ERROR STATE

### 27.1 Error State Anatomy

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    [ILLUSTRATION: error_*]                       │  ← Illustration (120x120, amber/red tinted)
│                                                                  │
│                    [KERI_MASCOT 48px]                            │  ← KERI (concerned expression)
│                                                                  │
│              "Sambungan terputus"                                │  ← Headline (h3, text-primary)
│         "Maaf, saya tidak dapat mencapai pelayan.                │  ← Description (body, text-secondary)
│          Sila cuba sekali lagi."                                 │
│                                                                  │
│              [Cuba Lagi]                                         │  ← CTA (green primary)
│              [Hubungi Sokongan]                                  │  ← Secondary (ghost)
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 27.2 Error Variants

| Type | Colour | KERI? | Illustration |
|------|--------|-------|-------------|
| Connection error | Amber | ✅ (concerned) | `error_connection` |
| Permission denied | Red | ❌ | `error_generic` |
| Not found (404) | Amber | ❌ | `error_generic` |
| Server error (500) | Red | ❌ | `error_generic` |
| Form validation | Red (inline) | ❌ | None — inline error text |
| AI error (chat) | Amber (inline) | ✅ (concerned) | None — KERI speaks the error |

### 27.3 Rules

- Errors are never scary — KERI helps soften the experience
- Inline form errors: red text below the field, no illustration
- AI chat errors: KERI sends a message explaining what happened in Malay
- Full-page errors: illustration + KERI + headline + description + CTA
- Toast errors: red left border, `--bg-surface`, auto-dismiss after 5s
- Error messages are in Bahasa Melayu, never technical jargon

---

## 28. AI CHAT LAYOUT

### 28.1 Chat Area Anatomy

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  [KERI 64px]  "Selamat pagi! Saya KERI, kerani kewangan anda.    │  │  ← AI Greeting (welcome)
│  │               Apa yang anda ingin buat hari ini?"                │  │
│  │               [Cakap] [Upload Resit] [Upload Penyata Bank]      │  │  ← Quick action chips
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ── Quick Prompts (when chat is empty) ──                                │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐               │
│  │ "Rekod jualan  │ │ "Tambah        │ │ "Upload resit  │               │  ← Quick prompt cards
│  │  hari ini"     │ │  perbelanjaan" │ │  terkini"      │               │
│  └────────────────┘ └────────────────┘ └────────────────┘               │
│                                                                          │
│  ── Conversation ──                                                      │
│                              ┌──────────────────────────────────────┐   │
│                              │  "Saya jual kuih RM 200 tadi pagi"  │   │  ← User message (right, bg-surface-2)
│                              └──────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  [KERI 32px]  Baik! Saya cadangkan:                              │   │  ← AI message (left, violet glass)
│  │  ┌──────────────────────────────────────────────────────────────┐│   │
│  │  │  ┌─────────────────────────────────────────────────────────┐ ││   │  ← Suggestion card (glass, green glow)
│  │  │  │  Pendapatan  RM 200.00                                   │ ││   │
│  │  │  │  Kategori: Jualan | Tarikh: 26 Jun 2026                 │ ││   │
│  │  │  │  ☑️ Cadangan Semaka: Utiliti (accounting intelligence)  │ ││   │
│  │  │  │  [✅ Sahkan]  [✏️ Edit]  [❌ Tolak]                    │ ││   │
│  │  │  └─────────────────────────────────────────────────────────┘ ││   │
│  │  └──────────────────────────────────────────────────────────────┘│   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ── Chat Input (sticky bottom) ──                                        │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  [📎]  [🎤]  Type pesan...                           [Send →]   │   │  ← Input (glass, rounded)
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 28.2 Chat Bubble Styles

| Bubble | Background | Border | Corner | Alignment |
|--------|-----------|--------|--------|-----------|
| User message | `--bg-surface-2` (#16201C) | `--border-subtle` | 16px, bottom-right sharp | Right-aligned |
| AI message (text) | `--glass-card` (violet tint) | glass border | 16px, bottom-left sharp | Left-aligned |
| AI suggestion card | `--glass-card` + green left border | glass border | 16px | Left-aligned, within AI bubble |
| System message | transparent, text only | none | none | Centered |

### 28.3 Rules

- KERI avatar (32px) appears to the left of every AI message
- User messages have NO avatar — alignment alone distinguishes speaker
- Suggestion cards have a green glow (`--shadow-glow`) to draw the eye to the confirm action
- Quick prompts are only shown when chat is empty — they disappear after first message
- Chat input is always sticky at the bottom — never scrolls out of view
- The attach (📎) and voice (🎤) icons are input prefix icons, not separate buttons
- On mobile, the chat input adapts: full width, icons are 44px touch targets

---

## 29. AI WIDGET LAYOUT

### 29.1 AI Widget Definition

The "AI Widget" is the compact AI presence on non-chat screens — a small KERI card or suggestion panel that appears on the Dashboard, Documents, or Reports tabs.

### 29.2 Widget Variants

| Widget | Location | Content | Size |
|--------|----------|---------|------|
| KERI Briefing | Dashboard top | Natural language summary of financial status | Full width card |
| KERI Suggestion | Dashboard side panel | "You have 3 unconfirmed suggestions" + link to chat | 1/3 column on desktop |
| KERI Tip | Documents tab | "Upload a receipt to get started" | Inline banner |
| KERI Insight | Reports tab | "Your revenue grew 15% this month" | Full width card |

### 29.3 KERI Briefing Card (Dashboard)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [KERI 48px]  Ringkasan KERI                                   [✕]      │
│                                                                          │
│  "Pendapatan bulan ini RM 12,500 (+15%). Perbelanjaan RM 8,300 (-5%).  │
│   Baki bank stabil. Anda ada 2 resit belum disahkan.                     │
│   Cadangan: Semak komitmen kewangan anda yang akan tiba minggu depan."  │
│                                                                          │
│  [Lihat Cadangan]  [Upload Resit]                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 29.4 Rules

- KERI widgets use a violet-tinted background (`--accent-secondary-muted` at 20% opacity)
- KERI avatar is always present (48px in widgets, 32px in chat)
- Widget text is in Bahasa Melayu, conversational tone
- Widgets are dismissible (✕ button) — user can hide them
- Widgets reappear when new suggestions/insights are available
- On mobile, widgets are full-width cards at the top of the content area

---

## 30. COMPONENT HIERARCHY

### 30.1 Atomic Design Structure

```
Atoms (basic HTML elements styled)
├── Button (primary, secondary, ghost, danger — all with loading state)
├── Input (text, number, date, select, textarea — all with label, error, icon)
├── Badge (success, warning, danger, info, neutral)
├── Icon (lucide-react wrapper with size + colour tokens)
├── Text (display, h1, h2, h3, body, body-sm, caption, micro)
├── Avatar (image or initials, with status dot)
├── Divider (horizontal, vertical)
├── Spinner (16px, 20px, 24px — green stroke)
└── Checkbox / Radio / Toggle (green when active)

Molecules (2+ atoms combined)
├── FormField (label + input + error + help text)
├── MetricTile (icon + number + label + trend indicator)
├── ChatBubble (avatar + text + timestamp)
├── SuggestionCard (KERI avatar + transaction details + confirm/edit/reject buttons)
├── NavItem (icon + label + active indicator)
├── TabItem (label + optional badge count)
├── Toast (icon + message + action + close)
├── SearchBar (icon + input + clear button)
└── FileUpload (dropzone + file list + progress)

Organisms (complex sections)
├── Header (logo + workspace selector + notifications + avatar)
├── Sidebar (nav items grouped by section + user footer)
├── BottomNav (5 nav items + active indicator)
├── TabBar (horizontal tabs + "More" button)
├── ChatArea (messages + suggestions + quick prompts)
├── ChatInput (attach + voice + text input + send)
├── DashboardGrid (metric tiles + activity list + AI widget)
├── DataTable (header + rows + pagination + filters)
├── Modal (overlay + glass card + header + body + footer)
├── EmptyState (illustration + KERI + headline + CTA)
├── LoadingState (skeletons or KERI thinking)
├── ErrorState (illustration + KERI + headline + CTA)
├── KERIBriefing (mascot + natural language summary + actions)
├── StorageBar (progress bar + percentage + buy addon link)
└── TransactionList (filterable list with edit/evidence/flags)

Templates (page-level layouts)
├── LandingTemplate (hero + features + pricing + FAQ + footer)
├── LoginTemplate (centered card on dark background)
├── TenantTemplate (header + tab bar + content + bottom nav)
├── HQTemplate (header + sidebar + content)
└── ModalTemplate (overlay + centered glass card)
```

### 30.2 Component Styling Approach

All components will use **Tailwind CSS utility classes** with **CSS custom properties** for design tokens. The project already uses Tailwind CSS v4 (`@tailwindcss/vite`).

Design tokens (colours, spacing, radius, shadows) will be defined as CSS custom properties in `src/index.css` and mapped to Tailwind theme values. This allows:
- Consistent token usage across all components
- Easy theme adjustment (change one variable, all components update)
- Future light mode support (override tokens in a `.light` class)

### 30.3 CSS Token Structure

```css
:root {
  /* Colours */
  --bg-base: #0A0F0D;
  --bg-surface: #111815;
  --bg-surface-2: #16201C;
  --bg-surface-3: #1C2823;
  --border-subtle: #1F2B26;
  --border-default: #2A3832;
  --border-strong: #3A4A43;
  --accent-primary: #10B981;
  --accent-primary-hover: #059669;
  --accent-primary-muted: #064E3B;
  --accent-secondary: #8B5CF6;
  --accent-secondary-muted: #4C1D95;
  --text-primary: #F0FDF4;
  --text-secondary: #A7B3AE;
  --text-tertiary: #6B7872;
  --text-disabled: #4A544F;

  /* Semantic */
  --semantic-success: #22C55E;
  --semantic-warning: #F59E0B;
  --semantic-danger: #EF4444;
  --semantic-info: #3B82F6;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
  --shadow-xl: 0 16px 48px rgba(0,0,0,0.6);
  --shadow-glow: 0 0 24px rgba(16,185,129,0.15);

  /* Glass */
  --glass-panel: rgba(17,24,21,0.8);
  --glass-card: rgba(22,32,28,0.7);
  --glass-modal: rgba(28,40,35,0.9);
}
```

---

## BLUEPRINT STATUS

**Implementation Status:** STOP — awaiting Owner approval.

This blueprint is complete. No code has been written. No styles have been changed. No components have been modified.

The blueprint defines the complete visual design language for MYKERANI:
- Dark premium theme with green accents
- KERI mascot as the AI face
- Glass effects for floating elements
- 30 design sections covering every aspect of the visual presentation layer
- Placeholder system for logo, mascot, illustrations, and icons
- Responsive rules for mobile, tablet, desktop, and wide screens
- Component hierarchy from atoms to templates

Per the user's instruction: "Only after the Owner approves the blueprint may implementation begin."

---

*Blueprint authored: 2026-06-26*
*Repository: srcreative2020/mykerani-app*
*Design system: Dark Premium SaaS + Green Accent + KERI Mascot*