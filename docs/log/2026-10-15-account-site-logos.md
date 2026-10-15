# 账号 rows show big sites' logos

- Date: 2026-10-15 · Thread/agent: 帳號 · 大網站自動配 logo
- What changed: The bundled site list (`app/site-core.ts`, `app/site-icons.ts`) grows from about 30 to 124 sites with 122 brand glyphs (Simple Icons, CC0; 16.34.0, plus 12.0.0 for Amazon, Microsoft, Outlook, LinkedIn, OpenAI, Slack, Walmart, Canva, Adobe and Salesforce). Gmail, YouTube, Instagram, WhatsApp, Facebook, Outlook, 速卖通 and 阿里云 are now their own sites instead of Google / Meta / Microsoft / 阿里巴巴. A web address now matches the longest known domain (mail.google.com → Gmail, weixin.qq.com → 微信). Every 账号 row starts with its site's badge; the card title shows the badge only when 收起.
- User-visible change (plain Chinese, for the preview changelog): 账号列表每一条前面显示网站 logo，Gmail、Instagram、WhatsApp、LinkedIn、亚马逊、小红书等 120 多个常用大网站自动认出来；Instagram、WhatsApp、Gmail 不再归到 Meta / Google 一组
- Not done / risks: Logos are bundled, nothing is fetched for them. Existing entries for Instagram / WhatsApp / Gmail / YouTube / Outlook / 速卖通 / 阿里云 move from the Meta / Google / Microsoft / 阿里巴巴 card to their own card (an entry the user re-filed with 改归类 keeps that choice). Temu, Shein, 京东, 拼多多, Lazada, Yahoo have no CC0 glyph and keep the coloured initial. Not looked at on real Windows/Mac.
- Next step: 无
