# Sidebar group hierarchy

GRC operators need to distinguish the seven navigation groups from their page
links. The global compact button rule currently reduces both to medium weight.
Keep the existing single font, uppercase tracking, spacing and navigation modes;
set group labels to 700 at 10.5px, selected page links to 600 and other links to
500. Use the existing theme's primary text for closed groups and brand text for
the open group. This changes no routes, permissions, preferences or records.

Validate the existing compact typography matrix and sidebar theme browser script
in TR/EN, light/dark, expanded/icon/hidden/restored modes, including mobile menu
recovery. Review screenshots for clipping and visual hierarchy. Publish after
checks and verify the exact deployed revision; reverting the commit restores the
previous appearance without a migration. Results are recorded in the delivery PR.
