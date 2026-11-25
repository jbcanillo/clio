---
name: Symbiosis AI
colors:
  surface: '#f2fbff'
  surface-dim: '#d0dce1'
  surface-bright: '#f2fbff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaf6fb'
  surface-container: '#e4f0f5'
  surface-container-high: '#deeaf0'
  surface-container-highest: '#d8e4ea'
  on-surface: '#121d21'
  on-surface-variant: '#40484a'
  inverse-surface: '#273236'
  inverse-on-surface: '#e7f3f8'
  outline: '#70797a'
  outline-variant: '#bfc8ca'
  surface-tint: '#2f666f'
  primary: '#00343b'
  on-primary: '#ffffff'
  primary-container: '#0d4c55'
  on-primary-container: '#85bbc6'
  inverse-primary: '#99cfda'
  secondary: '#ab3500'
  on-secondary: '#ffffff'
  secondary-container: '#fe6a34'
  on-secondary-container: '#5d1900'
  tertiary: '#00343b'
  on-tertiary: '#ffffff'
  tertiary-container: '#004c56'
  on-tertiary-container: '#74bdcb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b5ecf6'
  primary-fixed-dim: '#99cfda'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#104e57'
  secondary-fixed: '#ffdbd0'
  secondary-fixed-dim: '#ffb59d'
  on-secondary-fixed: '#390c00'
  on-secondary-fixed-variant: '#832600'
  tertiary-fixed: '#a4eefd'
  tertiary-fixed-dim: '#88d2e0'
  on-tertiary-fixed: '#001f24'
  on-tertiary-fixed-variant: '#004e59'
  background: '#f2fbff'
  on-background: '#121d21'
  surface-variant: '#d8e4ea'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  margin: 1.25rem
  margin-sm: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

The design system embodies the balance between deep introspective calm and proactive cognitive energy. Built for an AI-native companion orchestrating journal entries, dynamic reminders, and contextual scratchpads, the interface merges thoughtful mindfulness with instantaneous utility. The emotional tone is reassuring, focused, and perceptually frictionless.

The aesthetic fuses **Modern Soft Minimalism** with **Generative Glassmorphic Tactility**:
- Surfaces remain pristine, breathing with airy slate-tinted canvas backdrops.
- Dynamic generative containers utilize subtle frosted glass layers, crisp hairline borders, and translucent surface washes to differentiate AI-synthesized widgets from static user logs.
- Reactive kinetic elements (e.g., active listening pulses, reminder triggers, mood waveforms) introduce purposeful, high-energy accents that contrast against steady, grounding teal structures.

## Colors

The palette establishes a high-clarity hierarchy suited for seamless transitions between conversational streams and structured tooling:

- **Primary Teal (`#0D4C55`, `#146B78`, `#072B30`)**: Delivers cognitive calm, visual depth, and structure. Used for app navigation chrome, heavy typography anchors, dominant brand accents, and resting container surfaces.
- **Vibrant Accent Orange (`#FF6B35`, `#FA824C`, `#FFE8DF`)**: Catalyzes interactive generative widgets, pending reminders, active AI voice streams, and floating creation triggers. Light orange tints provide distinct backgrounds for machine-synthesized action proposals.
- **Neutrals & Surface Foundation**:
  - Main Canvas: `#F8FAFA` (soft slate-tinted warm cream)
  - Card & Raised Containers: `#FFFFFF`
  - Inset Surfaces & Input Wells: `#EDF2F2`
  - Low-Contrast Borders: `#E1EAEB`
- **Text & Content**:
  - Primary Text: `#131E22` (deep oceanic slate)
  - Secondary / Supporting: `#47585F`
  - Muted / Placeholders / Metadata: `#82949B`

## Typography

The pairing of **Plus Jakarta Sans** for headers/labels with **Inter** for long-form narrative body copy balances personality and legibility:

- **Display & Section Titles (Plus Jakarta Sans)**: The sculpted geometric curves inject warmth and conversational approachability to daily summaries, greeting banners, and mood cards.
- **Narrative & System Output (Inter)**: Provides neutral, dense, and hyper-legible rendering for long-form reflective journal entries, multi-line task titles, quick voice transcription strings, and nested lists.
- **Status Badges & Interactive Data**: Rendered in `label-sm` or `label-md` with slight tracking expansions to maintain immediate legibility across time markers, mood tags, and AI state labels.

## Layout & Spacing

The layout is built for dynamic mobile content feeds with conversational streaming support:

- **Rhythm & Grid**: Single-column vertical stream on mobile viewport (`margin: 1.25rem`), migrating to a dual-pane conversational-workspace model on tablet screens (`margin: 2rem`, `gutter: 1.5rem`).
- **Dynamic Inset System**:
  - Conversational bubbles use compact internal paddings (`space-sm` vertical, `space-md` horizontal).
  - Rich generative cards (interactive checklists, waveform scrubbers) utilize generous room (`space-lg`) to prevent accidental taps.
- **Vertical Hierarchy**: Spacing scales vertically in increments of 4px/8px, keeping inline metadata pinned closely (`space-xs` to `space-sm`) to headers while isolating distinct thoughts and dates with `space-xl`.

## Elevation & Depth

Visual hierarchy leverages a hybrid of **Tonal Layering** and **Luminescent Ambient Soft Glows**:

- **Level 0 (Base Canvas)**: Flat `#F8FAFA`. Background for conversation feeds and timeline navigations.
- **Level 1 (Structured Content Cards)**: Pure white `#FFFFFF` paired with an ultra-thin hairline border (`1px solid #E1EAEB`) and an ambient tinted drop shadow: `0 8px 24px -4px rgba(13, 76, 85, 0.05)`.
- **Level 2 (Generative AI Cards & Active Triggers)**: Frosted glass effect (`rgba(255, 255, 255, 0.85)` with `backdrop-filter: blur(12px)`), framed with a glowing accent rim: `1px solid rgba(255, 107, 53, 0.20)`, elevated by a soft warm shadow: `0 12px 32px -6px rgba(255, 107, 53, 0.12)`.
- **Level 3 (Modals, Context Overlays, Audio Bar Recorder)**: Solid `#FFFFFF`, elevated with `0 16px 40px -8px rgba(7, 43, 48, 0.14)`.

## Shapes

The interface balances soft organic friendliness with structured clarity:

- Standard structural cards, modular prompt boxes, and lists apply a base roundedness of `0.5rem` to `1rem` (`rounded-lg`).
- Transient, conversational, and highly touchable objects—such as AI prompt suggestion pills, status markers, tags, floating audio transcription pods, and quick action chips—adopt full pill perimeters (`rounded-full` / `9999px`).
- Generative action containers blend both: a curved shell (`1.5rem` / `rounded-xl`) containing inner pill action elements.

## Components

### Buttons
- **Primary Action (Commit / Save / Send)**: Solid `#0D4C55` background, `#FFFFFF` text, `rounded-full`, height 48px, horizontal padding `space-lg`. On active tap: scales to 0.98, background shifts to `#072B30`.
- **AI Action Trigger (Generate / Synthesize / Transform)**: Vibrant orange gradient (`#FF6B35` to `#FA824C`), `#FFFFFF` bold text, ambient glow shadow `0 6px 20px rgba(255, 107, 53, 0.35)`.
- **Secondary / Ghost**: Transparent surface with `1px solid #E1EAEB`, `#131E22` text, hover/active fill `#EDF2F2`.

### Chips & Interactive Pills
- **Smart Suggestions**: Pill-shaped containers (`rounded-full`) in `#FFFFFF` with `1px solid #E1EAEB`, micro-icon in `#FF6B35`, text in `label-md` (`#47585F`).
- **Calendar & Time-Block Chips**: Slate tint `#EDF2F2` in resting state; switches to `#0D4C55` with `#FFFFFF` text when selected.
- **AI Processing Badge**: Pill container with `#FFE8DF` fill, `#FF6B35` text, and a pulsing 6px dot indicator.

### Input Fields & Multimodal Bar
- **Conversational Scratchpad**: Seamless expanding bottom bar with frosted glass background (`rgba(255, 255, 255, 0.92)`), rounded-xl (`1.5rem`), inset border `#E1EAEB`. Integrated audio waveform microphone trigger on trailing edge.
- **Standard Inputs**: Bordered box with `#EDF2F2` resting fill, shifting to `#FFFFFF` with a crisp `1.5px solid #0D4C55` focus ring.

### Checklists & Radio Reminders
- **Inline Task Toggles**: Circular checkbox (`20px`) with a `1.5px solid #82949B` perimeter. Completed state transitions dynamically via spring animation to solid `#0D4C55` with an internal white checkmark and strikethrough transition on text (`#82949B`).
- **Urgent / Alarm Indicator**: Uses `#FF6B35` ring pulse for overdue or high-priority reminders.

### Cards & Generative Widgets
- **Daily Reflection Card**: Solid `#FFFFFF`, soft shadow, left accent border (3px solid `#0D4C55`), housing sentiment analysis indicators and inline prompt triggers.
- **Audio Mood Waveform Card**: Dynamic container featuring live svg-rendered sound bars oscillating between `#0D4C55` and `#FF6B35`, complete with scrubbing thumb and speed toggles (1x, 1.5x).
- **AI Generative Action Box**: Translucent orange-tinted background (`#FFF8F5`) surrounded by an ambient orange highlight line, embedding dynamic actions like "Convert note to 3 tasks" or "Schedule reminder for 9:00 AM".