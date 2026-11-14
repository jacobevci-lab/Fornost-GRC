# Sidebar theme consistency

An operator switching from expanded navigation to icons must keep the selected
light/dark palette, selected module and readable controls. A relationship-view
stylesheet globally forced fixed petrol colors onto compact navigation, while
the previous contrast test covered only expanded navigation.

Remove those unrelated shell overrides so the existing workspace theme owns all
navigation modes. No palette, navigation behavior, permissions or record changes.
The browser regression compares actual expanded/compact/restored surface, icon,
selection and mode-button colors in TR/EN and light/dark, checks compact reload
persistence, and verifies hidden-menu recovery. It captures each state and runs
in the isolated layout probe. Production cloud-browser verification remains a
separate check, dependent on a confirmed signed-in session.
