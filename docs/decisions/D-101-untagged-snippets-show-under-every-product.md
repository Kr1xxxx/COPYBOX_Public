### D-101 话术 without a product show under every product filter (2026-10-20)
- Context: products come only from imported sheets/documents; the normal editor has no product field. Choosing a
  product in the 全部产品 filter hid every 话术 a person typed by hand (2026-10-14 advice, old item 23; desktop audit G,
  picked by Krix 2026-10-20).
- Decision: `matchesSnippetProduct` treats a 话术 with no product groups as matching every product. Tagged 话术 filter as
  before; imported rows without a product still get 通用 and are unchanged.
- Not done: no product picker in the editor (the advice's other option); nothing in the stored data changes.
