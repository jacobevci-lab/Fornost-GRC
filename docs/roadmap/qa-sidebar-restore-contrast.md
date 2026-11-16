# Readable hidden-menu recovery

An operator who hides navigation must still be able to find and reopen it in
either theme. Source inspection at `0b18f32` found that `.sidebar-restore:hover`
forces white text and icon strokes over the dark theme's light teal brand fill.
The existing sidebar browser contract checks open/compact/hidden/restored states
but does not inspect hover contrast. Reuse the existing `--fornost-on-brand`
foreground token; retain the palette, layout, navigation and permissions.

Acceptance: the real restore button's label has at least 4.5:1 contrast and its
icon at least 3:1 in resting, hover and keyboard-focus states, in light and dark
themes. Keyboard focus remains visible, Enter restores navigation, and the
existing pointer restore and compact-navigation assertions still pass. Capture
state screenshots and report measured ratios in the existing browser gate. No
business records, schema, credentials or role changes are needed. Run lint,
types, existing CI and the affected browser gate before release; verify the
deployed revision and repeat the same gate on production. Rollback is a revert.
