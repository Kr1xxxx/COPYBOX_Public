# Dragged items are 80% opaque (2026-10-11)

- What changed: the item being dragged (folder rows, 话术 cards, settings folders, remembered values) is drawn at 80% opacity, so the place under it stays visible. CSS only.
- User-visible change: while you drag something, it turns slightly see-through.
- Tests: the standard-folder drag e2e checks the opacity while held.
- Decisions: none.
