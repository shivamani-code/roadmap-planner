# Design Tokens and Accessibility Baseline

This is an implementation contract, not final branding. Phase 1 creates code tokens; later visual design may change values while preserving semantic roles and accessibility.

## Semantic color tokens

| Token                | Light value | Use                                      |
| -------------------- | ----------- | ---------------------------------------- |
| `color.canvas`       | `#F7F7F5`   | App background.                          |
| `color.surface`      | `#FFFFFF`   | Cards, panels, dialogs.                  |
| `color.text.primary` | `#142033`   | Primary text.                            |
| `color.text.muted`   | `#556273`   | Secondary text; must retain AA contrast. |
| `color.border`       | `#D9DEE7`   | Component boundaries.                    |
| `color.brand`        | `#3849C6`   | Primary action/link.                     |
| `color.brand.hover`  | `#2E3BAB`   | Primary hover/pressed adjustment.        |
| `color.success`      | `#16734A`   | Verified/completed.                      |
| `color.warning`      | `#9A5B08`   | Attention/at risk.                       |
| `color.danger`       | `#B42318`   | Blocking/destructive only.               |
| `color.focus`        | `#1B6EF3`   | 2px focus ring with 2px offset.          |

Do not use color alone. Each state also has text/icon/shape. Validate actual foreground/background pairs in code; hex values do not waive contrast testing.

## Typography and spacing

```text
font.family.sans = Inter, ui-sans-serif, system-ui, sans-serif
font.size.body   = 16px
font.size.small  = 14px
font.size.h4/h3/h2/h1 = 16/20/24/32px
font.line.body   = 1.5
font.weight.regular/medium/semibold = 400/500/600

space.1/2/3/4/6/8 = 4/8/12/16/24/32px
radius.control/card/dialog = 8/12/16px
touch.minimum = 44px
content.maximum = 1280px
sidebar.width = 240px
```

Use tabular numerals for durations/scores. Do not reduce body text below 16px on mobile or 14px for secondary labels. Avoid all-caps sentences.

## Component behavior baseline

- One primary action per page/decision region.
- Buttons have visible hover, active, focus, disabled, loading, and destructive states.
- Inputs retain labels outside the field; placeholder is not a label.
- Errors connect with `aria-describedby`, explain recovery, and focus the first invalid field after submit.
- Dialogs trap focus, name themselves, close with Escape unless a destructive transaction is committing, and restore focus.
- Toasts are not the sole location of critical information; async results update the page and use an appropriate live region.
- Drag/drop has a keyboard/menu alternative. Hover-only content is prohibited.
- Charts include exact values and a table/list alternative. Radar charts are never the only representation.
- Progress bars expose label, exact value, maximum, and meaning; indeterminate progress never invents percentage.

## WCAG 2.2 AA baseline

- Text contrast ≥4.5:1; large text and UI boundaries ≥3:1.
- Keyboard operation and visible, unobscured focus for every control.
- Focus is not hidden by sticky header/footer; target size 44×44 where practical and never below WCAG minimum.
- Semantic landmarks/headings follow document order; one page-level heading.
- Status, errors, and loading changes use appropriate live announcements without repetition.
- At 320 CSS pixels and 200% zoom, critical flows reflow without horizontal page scrolling or loss of action.
- Respect reduced motion; no flashing, autoplay, or animation required to understand state.
- Authentication and assessment do not rely on memory/cognitive tests unrelated to security/skill being measured.
- Time limits are absent for normal planning. Real diagnostics disclose the limit and allow accommodation where validity permits.
- Help/contact and privacy controls appear consistently.

## Responsive rules

- Desktop: 12-column content with 240px sidebar.
- Tablet: 8 columns; collapsible sidebar.
- Mobile: 4 columns; bottom navigation; vertical timelines and day accordions.
- Dense week/calendar grids become day cards; dependency graphs always have text-list equivalents.
- Sticky mobile action bars must not obscure focused fields or browser controls.

## Completion feedback

Use a short check transition and specific outcome (“SQL joins practice completed; 2 of 3 week database tasks done”). No default confetti, sound, shame, competitive rank, or broken-streak warning.

## Phase 1 component acceptance

Every primitive requires Storybook-equivalent examples or an accessible demo route for all states, automated accessibility checks, keyboard tests for composite widgets, and visual verification at 320px/200% zoom before feature use.
