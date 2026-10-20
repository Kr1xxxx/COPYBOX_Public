### D-101 公司 / 我的 filter, and 话术 without a product show under every product (2026-10-20)
- Context: products come only from imported sheets/documents; the normal editor has no product field. Choosing a
  product in the 全部产品 filter hid every 话术 a person typed by hand (2026-10-14 advice, old item 23; desktop audit G,
  picked by Krix 2026-10-20). Krix then asked for two options left of 「选择」 to tell company 话术 from a person's own.
- Decision:
  - `matchesSnippetProduct` treats a 话术 with no product groups as matching every product. Tagged 话术 filter as
    before; imported rows without a product still get 通用.
  - Two toggle buttons 「公司」 and 「我的」 sit left of 「选择」 in the 话术 list header (`matchesSnippetSource`).
    公司 = has a company-library link (`shared`, retired ones included); 我的 = everything else. Clicking the active
    one again shows all; the picked one is filled with the accent colour (Krix). They reset with the product filter (section switch, trash, jump to an entry). Names chosen
    by Krix.
- Not done: no product picker in the editor; nothing in stored data changes. The mini window got 公司 / 我的 in D-106.
