### D-076 账号 gets an 「地址」 category for company addresses (2026-10-19)
- Context (owner, 2026-10-19: 「账号分类加一个地址」, then 「公司地址」): staff paste company addresses (their own
  company, suppliers, warehouses) into forms and chats and want them next to 收款信息.
- Decision:
  - A new 账号 category **地址**, on Mac and Windows, placed right after 收款信息 in the sidebar and in the 新增 menu.
    The label is 「地址」 (not 「公司地址」) so it stays short in the sidebar and also fits a warehouse or a factory;
    the form itself asks for a 公司名称.
  - Fields: 公司名称 (the entry's title, needed), 联系人, 电话, 地址 (needed, several lines), 备注.
  - Nothing is hidden. 「复制完整地址」 (and the row's copy button) copies company, then contact and phone, then the
    address; 备注 is not copied. Each part also has its own copy button.
  - In 全部, all addresses sit in one 「地址」 card just before 收款信息 (addresses are not websites).
  - Search looks in every part. Backup, restore and 登录同步 carry it like every other entry; nothing is held back on a
    Mac because nothing in it is secret. There are no MCP tools for 账号 entries, so none were added.
- Storage: no new key and no format change. An address is one more item type (`type: "address"`) in the encrypted
  `clipbox.vault-items.v1` list, with its parts in a `fields` record. An older app version that receives one through
  sync or a backup lists it as a 收款信息 entry without failing; it does not show it in the 收款信息 panel.
- Status: Accepted (owner request 2026-10-19).
