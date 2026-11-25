# Fornost GRC Enterprise UI Contract

This contract is mandatory for every new screen, component and visual extension in Fornost GRC.

## 1. Visual authority

The existing workspace is the design system. New features must extend it, never create a parallel theme.

Authoritative layers:

1. `app/workspace-system.css` — workspace tokens, shell, navigation, base surfaces
2. `app/enterprise-surface-contract.css` — shared enterprise surface behavior
3. `app/product-experience.css` — density, hierarchy, register/dashboard experience
4. `app/theme-integrity.css` — final light/dark, typography, focus and color contract

Feature CSS may define layout for its own component, but must not redefine the product palette, typography system or global theme.

## 2. Mandatory tokens

Use the `--ws-*` tokens for product styling:

- Background: `--ws-bg`
- Main surface: `--ws-surface`
- Secondary surface: `--ws-surface-2`
- Primary text: `--ws-ink`
- Secondary text: `--ws-muted`
- Tertiary text: `--ws-faint`
- Border: `--ws-line`
- Strong border: `--ws-line-strong`
- Brand: `--ws-brand`
- Brand hover/accent text: `--ws-brand-2`
- Brand soft surface: `--ws-brand-soft`
- Positive: `--ws-positive`
- Warning: `--ws-warning`
- Danger: `--ws-danger`
- Information: `--ws-info`
- Shared elevation: `--ws-shadow`
- Dark-mode section accent: `--ws-heading-accent`

Do not introduce feature-specific brand colors such as orange, violet, blue or green hex values. Semantic states must derive from the shared tokens, normally with `color-mix()`.

## 3. Typography

Fornost uses the workspace typography defined by the authoritative layers. Feature CSS must inherit it.

Guidelines:

- Operational text must not depend on sub-12px rendering.
- Standard body/supporting text: 12–14px.
- Form labels and actionable table text: 13px where practical.
- Section titles: use the same hierarchy as `.module-overview`, `.module-head` and audit surfaces.
- Eyebrows/kickers: uppercase, restrained letter spacing, brand text in light mode.
- In dark mode, section eyebrows may use `--ws-heading-accent`; do not introduce a second accent system.
- Avoid oversized marketing typography inside operational modules.

## 4. Surface hierarchy

Use a restrained enterprise hierarchy:

- Workspace canvas: `--ws-bg`
- Primary cards/workspaces: `--ws-surface`
- Toolbars, headers, secondary rows: `--ws-surface-2`
- Standard borders: `--ws-line`
- Inputs: `--ws-surface` with `--ws-line-strong`

Typical radii:

- Major workspace/hero: 14–15px
- Inner panel: 9–12px
- Input/button: 8–9px
- Pills only for status/chips

Use `--ws-shadow` for elevated enterprise panels. Do not create independent shadow recipes unless a platform-level design change explicitly requires it.

## 5. Buttons and actions

Primary action:

- background/border `--ws-brand`
- hover `--ws-brand-2`
- white text

Secondary action:

- `--ws-surface` or `--ws-surface-2`
- `--ws-line`
- `--ws-muted`
- hover to `--ws-brand-soft` / `--ws-brand-2`

Do not create a new primary color for an individual module.

## 6. Semantic state language

Semantic color has meaning only:

- Healthy/success → `--ws-positive`
- Attention/due soon → `--ws-warning`
- Failure/overdue/critical → `--ws-danger`
- Informational linkage → `--ws-info`
- Brand/selection/navigation → `--ws-brand`

Prefer a thin top/left state indicator, border mix, icon or restrained tinted background instead of fully saturated cards.

## 7. Dark mode

Every new feature must work from the same tokens without defining a separate dark palette.

Allowed dark-mode overrides should be structural only, for example:

```css
html[data-theme="dark"] .feature-kicker { color: var(--ws-heading-accent); }
```

Do not add feature-specific dark background colors, neon accents or independent dark shadows.

## 8. Density and complexity

Enterprise does not mean visually heavy.

- Prefer table/register patterns for operational data.
- Prefer one clear hero/summary, then detailed work surface.
- Use progressive disclosure for optional form fields.
- Keep primary actions to three or fewer per view.
- Do not add a new dashboard card if the signal belongs in My Work, an existing register or an existing assurance surface.
- Reuse shared patterns before creating a new card language.

## 9. Accessibility and interaction

- Preserve `:focus-visible` behavior from the theme contract.
- Do not remove focus outlines.
- Use semantic buttons/links.
- Maintain readable contrast in both themes.
- Support responsive layouts without horizontal page overflow.
- Tables may scroll within their own container.

## 10. Definition of done for new UI

Before a UI change is complete, verify:

1. Uses only existing workspace tokens for palette and elevation.
2. Matches existing typography hierarchy.
3. Matches standard enterprise radii/density.
4. Light mode is coherent with surrounding modules.
5. Dark mode is coherent and uses the established amber heading accent only where appropriate.
6. No feature-specific theme is introduced.
7. Responsive behavior is verified.
8. Existing navigation, forms, tables and accessibility behaviors are not overridden globally.
9. Business capability is integrated into the existing user journey rather than exposed as unnecessary new visual complexity.
10. CI/typecheck/build remains green.

## 11. Current product principle

**Fornost must be technically deep but visually calm.**

The application should feel like one enterprise product, not a collection of independently designed modules.
