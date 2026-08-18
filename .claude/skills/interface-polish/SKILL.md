---
name: interface-polish
description: Design-engineering rules that make UI feel finished — semantic HTML, focus and keyboard behavior, color tokens and dark mode, spacing rhythm, hit areas, motion and easing, typography and smart punctuation, form validation, empty states. Use this whenever you are writing or reviewing frontend code that a human will look at: building or restyling a component, adding hover/pressed/focus/disabled states, wiring up a form or modal, adding an animation or transition, setting up a color palette or dark mode, or when asked to make something "feel more polished", "look more professional", or "tighten up the design". Apply it proactively during frontend work rather than waiting to be asked about design.
---

# Interface Polish

A checklist of concrete, mostly one-line fixes that separate a UI that works from
one that feels finished. Most are cheap. The value is in applying them
consistently, while writing the code, rather than in a cleanup pass that never
happens.

Adapted from the [Interfaces cheat sheet](https://interfaces.dev/cheat-sheet).

## How to use this

**When writing new UI**: skim the sections relevant to what you're building
(a form → Forms + Accessibility; an animation → Motion), and apply them as you
go. Don't paste the rules into the code as comments — just follow them.

**When reviewing frontend code**: walk the checklist at the bottom. Report only
real violations in the code under review; don't invent nitpicks to fill out a
list, and don't rewrite working code purely to match a preference here.

**When a rule conflicts with the project's existing conventions**, the project
wins. These are defaults for greenfield decisions, not a mandate to refactor a
codebase that has already made a different choice coherently.

---

## Semantics

Native elements come with keyboard behavior, focus management, screen-reader
roles, and form participation already built. Re-implementing that on a `<div>`
is a large amount of work that is almost never done completely.

- Use the semantically correct native element: `<button>` for buttons, `<a>` for
  links. Never a plain `<div>` when a native element exists.
- The distinction that matters: `<a>` navigates, `<button>` acts. A "link" that
  mutates state should be a button; a "button" that goes somewhere should be a
  link, so it can be middle-clicked and copied.

## Accessibility and focus

- Style `:focus-visible`. Don't use `outline: none` without a replacement —
  keyboard users lose their place entirely, and it's invisible in the design
  file where the decision usually gets made.
- Only use `tabindex="0"` and `tabindex="-1"`. Positive values break the natural
  tab order for the whole page, not just the element.
- Give icon-only buttons a descriptive `aria-label`, and never put
  `aria-hidden="true"` on a focusable element — that creates a control a
  keyboard can reach but a screen reader can't name.
- Make the skip-to-content link the first focusable element, and add
  `scroll-margin-top` on anchored headings so a fixed header doesn't cover the
  target you just jumped to.
- Write alt text by purpose, not appearance: `alt="Search"` on a search button,
  not `alt="magnifying glass"`. Decorative images get `alt=""`.
- A tooltip on a disabled control never opens for keyboard or touch, so the
  explanation for *why* it's disabled is unreachable exactly when it's needed.
  Put the explanation in visible text next to the control, or use
  `aria-disabled="true"` to keep the control focusable.
- Use at least a 24×24px hit area — 44×44px on touch and 40×40px on desktop
  where the layout allows. The visual size can stay small; pad the target.

## Forms

- Give every input a real `<label>`, plus `type` and `inputmode`. `inputmode`
  is what gets a phone keyboard to show a numeric pad.
- Never block paste. People paste passwords and one-time codes, and blocking it
  pushes them toward weaker credentials they can type.
- Keep submit enabled until the request starts. Disabling it until the form is
  valid hides *which* field is wrong and gives no way to ask.
- Validate on submit: set `aria-invalid="true"`, point `aria-describedby` at the
  error message, and move focus to the first invalid field.

## Color

- Give every step in a palette a purpose: page background, component hover,
  border, solid fill, body text. A ramp with steps that don't map to a use is a
  ramp people pick from at random.
- Components reference semantic tokens (`--color-text-secondary`), never
  primitives (`--blue-500`). The primitive is the raw value; the token is how
  the value is used — and only the token survives a rebrand or a theme.
- A dark palette is not the light palette reversed. Dark surfaces need different
  contrast steps, and pure inversions produce muddy mid-tones.
- Measure contrast against the background the element actually renders on, not
  the page background. Text on a card on a tinted section is three layers deep.
- Disable all transitions while switching theme. Otherwise every color on the
  page cross-fades independently and the swap looks broken.

## Spacing and layout

- Make the gap between groups at least twice the gap inside one — 8px within,
  16px+ between. Proximity is what tells the eye where a group ends; that
  ratio does more for perceived structure than borders do.
- Use logical properties (`margin-inline-start`, `padding-inline-end`) rather
  than `left`/`right`, so layouts survive RTL without a second stylesheet.

## Typography

- `overflow-wrap: break-word` anywhere long words, URLs, or IDs can appear —
  those are the strings that escape a container and break the layout.
- `white-space: nowrap` on labels and badges, which look wrong wrapped.
- Apply `-webkit-font-smoothing: antialiased` and
  `-moz-osx-font-smoothing: grayscale` once on the root, never per component —
  per-component application produces visibly different weights side by side.
- Use `font-variant-numeric: tabular-nums` on every value that changes and in
  table columns: timers, counters, prices, data. Without it digits change width
  and the number jitters as it updates. Skip it if the font is already monospace.
- Store copy in its natural case and control presentation with `text-transform`.
  Copy stored as "SAVE DRAFT" can't be un-uppercased later, and screen readers
  may spell it out.
- Use smart punctuation: curly quotes, an en dash for ranges (9–5), an em dash
  for asides, and the single ellipsis character (…) rather than three periods.

## Buttons and labels

- Start button labels with a verb: "Save draft", "Delete project" — not "OK!" or
  a bare "Yes". A verb tells you what happens without re-reading the dialog.
- Repeat the consequence in confirmation buttons: "Delete project" next to
  "Cancel", so the destructive choice is identifiable at a glance.
- Scale buttons down slightly when pressed — between 0.95 and 0.98, with
  `transition: scale 200ms ease-out`. It's the cheapest way to make a control
  feel physical.

## Motion

- Use CSS transitions for interactions, because they can be interrupted
  mid-flight. Use keyframes for sequences that run once. A hover animation built
  from keyframes has to finish before it can reverse, which feels stuck.
- Wrap motion in `@media (prefers-reduced-motion: no-preference)` so it only
  plays for people who haven't asked to reduce it.
- Don't animate high-frequency interactions — the color change on a list item
  hover, for instance. Motion on something that fires constantly reads as lag.
- Stagger entrance animations by group, or by individual element where the
  count is small.
- Cross-fade icons when they swap: the entering icon goes scale 0.25 → 1,
  opacity 0 → 1, blur 4px → 0. A hard swap reads as a glitch.
- Use `will-change` only for properties actually changing: `transform`,
  `opacity`, `filter`. It's a promise to the compositor, and over-applying it
  costs memory.
- If an element shifts randomly by 1–2px while animating — most often Safari on
  iOS — add `will-change: transform` to force it onto its own layer.

## Pointer and hover

- Put hover styling behind `@media (hover: hover)`. On touch, `:hover` sticks
  after a tap, leaving the element looking permanently selected.

## Images

- Give images a 1px outline offset by -1px: black at 8% opacity in light mode,
  white at 8% in dark. It defines the edge of images whose corners are close to
  the background color, without reading as a border.

## States

- An empty state should orient the reader and offer one next action. "No
  results" tells someone the query ran and nothing else — it's a dead end at
  exactly the moment they need a way forward.

---

## Review checklist

When reviewing frontend code, these are the ones most often missed:

1. `<div>` acting as a button or link
2. `outline: none` with no `:focus-visible` replacement
3. Icon-only button with no `aria-label`
4. Hover styles not behind `@media (hover: hover)`
5. Motion not behind `prefers-reduced-motion`
6. Hard-coded color primitives instead of semantic tokens
7. Changing numbers without `tabular-nums`
8. Submit disabled until the form validates
9. Hit areas under 24×24px
10. Uniform spacing that doesn't separate groups from their contents
11. Empty state that says "No results" and stops
12. `alt` text describing the picture instead of its purpose
