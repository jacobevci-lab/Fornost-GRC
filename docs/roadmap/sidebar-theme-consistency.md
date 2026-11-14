# Sidebar theme consistency

An operator switching from expanded navigation to icons must keep the selected
light/dark palette, selected module and readable controls. A relationship-view
stylesheet globally forced fixed petrol colors onto compact navigation, while
the previous contrast test covered only expanded navigation.

Remove those unrelated shell overrides so the existing workspace theme owns all
navigation modes. No palette, navigation behavior, permissions or record changes.
Live cloud-browser inspection also reproduced the hidden-mode restore button
covering the page heading. Place that control in the existing header flow, where
it remains visible without floating over page content; mobile retains its own
menu toggle.

The browser regression compares actual expanded/compact/restored surface, icon,
selection and mode-button colors in TR/EN and light/dark, checks compact reload
persistence, hidden-menu recovery, title separation and tablet/mobile bounds.
It captures each state and runs in the isolated layout probe. Production
cloud-browser verification is separate: the Test/Admin session reproduced the
pre-fix theme and restore-button defects; post-deployment verification is pending.
