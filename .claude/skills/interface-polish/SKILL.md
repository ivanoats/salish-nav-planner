---
name: interface-polish
description: >-
  Design-engineering rules that make UI feel finished — concentric radii and optical
  alignment, animation and easing, typography and smart punctuation, semantic color
  tokens and dark mode, accessibility and focus behavior, spacing rhythm, and UI
  writing. Use this whenever you are writing or reviewing frontend code a human will
  look at: building or restyling a component, adding hover/pressed/focus/disabled
  states, wiring up a form or modal, adding an animation or transition, setting up a
  color palette or dark mode, writing button labels or empty states, or when asked
  to make something "feel more polished", "look more professional", or "tighten up
  the design". Apply it proactively during frontend work rather than waiting to be
  asked about design.
---

<!-- markdownlint-disable MD013 -->
# Interface Polish

Concrete, mostly one-line fixes that separate a UI that works from one that
feels finished. Most are cheap. The value is in applying them while writing the
code, rather than in a cleanup pass that never happens.

Source: [Interfaces cheat sheet](https://interfaces.dev/cheat-sheet).

## How to use this

**Writing new UI**: skim the sections relevant to what you're building — a form
→ Accessibility + Writing; an animation → Animation. Apply them as you go.
Don't paste the rules into the code as comments; just follow them.

**Reviewing frontend code**: walk the checklist at the bottom. Report only real
violations in the code under review. Don't invent nitpicks to fill out a list,
and don't rewrite working code purely to match a preference here.

**When a rule conflicts with the project's existing conventions**, the project
wins. These are defaults for greenfield decisions, not a mandate to refactor a
codebase that has already made a different choice coherently.

---

## User interface

- Use **concentric border radius** on nested elements: the outer radius equals
  the inner radius plus the padding between them. Mismatched radii make the
  gap between two rounded rectangles visibly pinch at the corners.
- Align **optically**, not geometrically. A play triangle centered by its
  bounding box looks left-heavy; the eye measures visual mass, not coordinates.
- Give images a `1px` outline offset by `-1px`: black at `8%` opacity in light
  mode, white at `8%` in dark. It defines the edge of images whose corners sit
  close to the background color, without reading as a border.

## Animation

- Never use `transition: all`. Name the **exact properties** that change —
  otherwise you animate properties you never intended, including ones added
  later, and pay layout cost for them.
- Scale buttons down slightly when **pressed**, between `0.95` and `0.98`, with
  `transition: scale 200ms ease-out`. The cheapest way to make a control feel
  physical.
- **Cross-fade icons** when they swap: the entering icon scales `0.25` → `1`,
  opacity `0` → `1`, blur `4px` → `0px`; the exiting one reverses the same
  animation. A hard swap reads as a glitch.
- Use CSS transitions for interactions, because they **can be interrupted**.
  Use keyframes for sequences that only run once. A hover effect built from
  keyframes has to finish before it can reverse, which feels stuck.
- **Disable all transitions** when switching theme. Otherwise every color on the
  page cross-fades independently and the swap looks broken.
- Use `will-change` only for properties actually changing: `transform`,
  `opacity`, `filter`. It's a promise to the compositor, and over-applying it
  costs memory.
- If an element **shifts randomly by 1–2px** while animating — most often Safari
  on iOS — add `will-change: transform` to force it onto its own layer.
- When animating entrance, **stagger** elements by group or by individual
  element.
- **Don't animate** high-frequency interactions, such as the color change of a
  list item on hover. Motion on something that fires constantly reads as lag.

## Typography

- Always use `.woff2` on the web, never `.ttf` or `.otf` — it's the same
  outlines at a fraction of the bytes.
- Use `font-variant-numeric: tabular-nums` on **every value that changes** and
  in **tables**: timers, counters, prices, data columns. Without it digits
  change width and the number jitters as it updates. Skip it if the font is
  already monospace.
- Cap long-form text at **60–75 characters** per line. Past that the eye loses
  the return sweep to the next line.
- Use `text-wrap: balance` on headings, `text-wrap: pretty` on descriptions,
  **neither in long-form text** — balancing is expensive and pointless once
  there are many lines.
- Use `overflow-wrap: break-word` where **long words, links or IDs** can escape
  the container; `white-space: nowrap` on labels and badges, which look wrong
  wrapped.
- Apply `-webkit-font-smoothing: antialiased` and
  `-moz-osx-font-smoothing: grayscale` **once on the root**, never per
  component — per-component application produces visibly different weights side
  by side.
- Store copy in **natural case** and control presentation with `text-transform`.
  Copy stored as "SAVE DRAFT" can't be un-uppercased later, and screen readers
  may spell it out.
- Use **smart punctuation**: curly quotes, an en dash for ranges, an em dash for
  asides, and the single ellipsis character (…) rather than three periods.
- Set `text-underline-position: from-font` with
  `text-decoration-skip-ink: auto`, so **underlines clear the descenders**.
- **Truncated text** keeps the full value reachable — in a tooltip or an
  expanded view. Truncation that destroys access to the value is data loss.

## Colors

- **Every step** in a palette should have a purpose: page background, component
  hover, border, solid fill, body text. Don't add steps that nothing uses — a
  ramp with unassigned steps is a ramp people pick from at random.
- Components use **semantic tokens** (`--color-text-secondary`), never
  primitives (`--blue-500`). The primitive is the raw value; the token is how
  the value is used, and only the token survives a rebrand or a theme.
- Never name a token for its **appearance or its first use**:
  `--color-accent-solid`, not `--color-blue-button` or `--color-sidebar-gray`.
  Both of those names become lies the first time something changes.
- Reserve `accent` **for the brand color**, so `primary` never means both the
  brand and the main body text.
- **Don't reuse a token from another role** just because it's the right color
  today. When that role's color changes, your element changes with it. Add a
  token for the new role instead.
- Measure contrast against the background the element **actually renders on**,
  not the page background. Text on a card on a tinted section is three layers
  deep.
- A dark palette **is not** the light palette reversed. Dark surfaces need
  different contrast steps, and pure inversions produce muddy mid-tones.
- Pick **one theme-switching mechanism** — `prefers-color-scheme` or a `.dark`
  class — and use it for every token. Mixing the two guarantees some tokens
  miss the switch.
- Define a gradient's **interpolation space** deliberately: `in oklab` for even
  brightness, `in oklch` for more vivid middle tones, or neither, which falls
  back to sRGB with its classic muted midpoint.

## Accessibility

- Use **semantically correct native elements**: `<button>` for buttons, `<a>`
  for links, never a plain `<div>` when a native element exists. Native elements
  bring keyboard behavior, focus, and roles for free, and re-implementing that
  is rarely done completely.
- Style `:focus-visible`; don't use `outline: none` **without a replacement**.
  Keyboard users lose their place entirely, and it's invisible in the design
  file where the decision usually gets made.
- Only use `tabindex="0"` and `tabindex="-1"`. **Positive values** break the
  natural tab order for the whole page, not just the element.
- Give **icon-only buttons** a descriptive `aria-label`, and never put
  `aria-hidden="true"` on a focusable element — that creates a control a
  keyboard can reach but a screen reader can't name.
- Write **alt text by purpose**: `alt="Search"` on a search button, not
  `alt="magnifying glass"`. Decorative images get `alt=""`.
- Give **every input** a real `<label>`, plus `type` and `inputmode`.
  `inputmode` is what gets a phone keyboard to show a numeric pad.
- **Never block paste**; people paste passwords and one-time codes, and blocking
  it pushes them toward weaker credentials they can type.
- A tooltip on a `disabled` control **never opens for keyboard or touch**, so
  the explanation is unreachable exactly when it's needed. Put it in visible
  text next to the control, or use `aria-disabled="true"` to keep the control
  focusable.
- **Keep submit enabled** until the request starts, then validate on submit:
  `aria-invalid="true"`, `aria-describedby` pointing at the error, focus on the
  first invalid field. Disabling submit until valid hides *which* field is wrong
  and gives no way to ask.
- Use at least a `24x24px` hit area, `44x44px` on touch and `40x40px` on
  desktop where possible. The visual size can stay small — pad the target — but
  make sure **extended hit areas never overlap**.
- Use `pointer-events: none` on **decorative elements** like glows and
  gradients, so they never swallow clicks meant for a control.
- Put hover styling behind `@media (hover: hover)`. On touch, `:hover`
  **sticks after a tap** and leaves the element looking selected.
- **Wrap motion** in `@media (prefers-reduced-motion: no-preference)` so it only
  plays for people who haven't asked to reduce it.
- Use `role="status"` for routine updates and `role="alert"` only for **urgent
  errors** — `alert` interrupts whatever the screen reader is saying.
- For status changes add an icon, a label, or an underline. Status **should
  never be conveyed by color alone**.
- Make the **skip-to-content link** the first focusable element, and add
  `scroll-margin-top` on anchored headings so a fixed header doesn't cover the
  target you just jumped to.

## Layout

- The gap between groups is **at least twice** the gap inside one: `8px`
  within, `16px`+ between. Proximity is what tells the eye where a group ends,
  and that ratio does more for perceived structure than borders do.
- Use **logical properties** like `margin-inline-start` and
  `padding-inline-end` instead of left and right, so layouts survive RTL
  without a second stylesheet.
- Don't use **fixed widths or heights** on text containers. Text reflows with
  content, translation, and user font size; a fixed box clips or overflows.

## Writing

- Start button labels with a **verb**: "Save draft" or "Delete project", never
  "OK!" or a bare "Yes". A verb says what happens without re-reading the dialog.
- **Repeat the consequence** in confirmation buttons: "Delete project" next to
  "Cancel", so the destructive choice is identifiable at a glance.
- Pick **one word per flow** and keep it for every step: "Continue" or "Next",
  never both. Switching words implies switching meaning.
- **Describe the destination** in link text: "Read docs", never "Click here".
  Links are often read out of context, in a list.
- Capitalize buttons, headings, and labels **the same way everywhere**.
  Sentence case is the safer default.
- Label toggles with **the state they turn on**: "Send read receipts", never
  "Disable read receipts" — a negative label plus an off position is a double
  negative.
- **Orient the reader** in empty states and offer one next action instead of
  "No results". "No results" confirms the query ran and nothing else; it's a
  dead end at the moment someone needs a way forward.
- Address the reader as **"you"**, not "the user".

---

## Review checklist

The violations most often found in frontend review:

1. `<div>` acting as a button or link
2. `transition: all`
3. `outline: none` with no `:focus-visible` replacement
4. Icon-only button with no `aria-label`
5. Hover styles not behind `@media (hover: hover)`
6. Motion not behind `prefers-reduced-motion`
7. Hard-coded color primitives instead of semantic tokens, or a token borrowed
   from another role
8. Changing numbers without `tabular-nums`
9. Submit disabled until the form validates
10. Hit areas under `24x24px`, or extended hit areas that overlap
11. Uniform spacing that doesn't separate groups from their contents
12. Status conveyed by color alone
13. Fixed width or height on a text container
14. Empty state that says "No results" and stops
15. `alt` text describing the picture instead of its purpose
16. "Click here" link text, or mixed "Continue"/"Next" in one flow
