# Remove Chinese Card Action and Compact Copy Control

## Goal

Remove the visible “中文” shortcut from every snippet card and make the remaining primary copy control smaller and quieter.

## Design

- Delete the Chinese shortcut button and its layout state entirely; do not rename or hide it with another badge.
- Keep Chinese text in structured metadata and keep the language switch inside the optional preparation dialog, so the underlying content is not deleted.
- Reduce the primary copy button from 32×32 to 28×28 pixels.
- Reduce the double-page glyph from 12×15 with a 2-pixel stroke to 10×13 with a 1.5-pixel stroke.
- Reduce the trailing grid column from 43 to 36 pixels while preserving the existing hover, active, copied, keyboard, and accessible-label behavior.
- Keep card height, typography, pinning, preparation, and drag behavior unchanged.

## Verification

The installed application must contain zero `.native-chinese` elements. The primary copy button must measure 28×28 pixels, remain keyboard accessible, and still copy the English message. Standard 680×620 and minimum 500×520 windows must have no horizontal overflow.
