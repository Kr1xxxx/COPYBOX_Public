# Category Color Markers Design

## Goal

Use the card marker color to identify a directory category instead of assigning the same orange color to every imported snippet.

## Meaning

- A category is an item's `folder` value in either the snippet or secret library.
- Every item in one folder uses the same marker color.
- Different visible folders receive different colors.
- “未分类” uses a neutral gray.
- Pinning, priority, product group, copy state, and directory order do not affect the category color.

## Architecture

Add a pure `buildCategoryColorMap(folderNames)` helper. It normalizes duplicate names, sorts names independently of the user-controlled directory order, selects a preferred color from a restrained fixed palette using a deterministic name hash, and resolves palette collisions by taking the next unused color.

The current folder set is mapped in `useMemo`. Card markers and directory-side markers read from the same map. Existing encrypted `item.color` values remain in the stored schema for compatibility but no longer control category markers. Moving an item to another folder therefore updates its marker immediately without rewriting unrelated items or migrating the vault.

## Visual Direction

- Preserve the existing 4-pixel card marker geometry.
- Add one small horizontal color swatch beside each custom directory name.
- Use muted colors that remain distinct on the existing off-white surface.
- Do not animate color changes and do not use the category palette for copy-success feedback.

## Limits and Fallbacks

The palette contains 20 distinct colors, more than the current directory count. If a library exceeds the palette, colors repeat only after all palette entries have been used. Empty folder names and items without a folder use the neutral fallback.

## Verification

Unit tests cover same-folder consistency, distinct colors across the current category count, stability after directory reordering, duplicate names, and neutral fallback. Packaged-app verification checks the sidebar/card mapping and confirms copy-success green remains separate.
