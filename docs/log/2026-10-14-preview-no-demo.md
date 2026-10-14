# Web preview opens without demo data

- Date: 2026-10-14 · Thread/agent: coordinator
- What changed: the web preview no longer adds 10 test pictures and three groups of test 话术 by itself on open, and its fake desktop shell no longer reports a demo update (9.9.9). The 补齐 10 张测试图 button and the 导入测试话术 menu still add test data by hand (tools/preview/wrapper.html, tools/preview/build.mjs, README).
- User-visible change (plain Chinese, for the preview changelog): 网页测试版打开时不再自动放入测试图片和测试话术，也不再弹「有新版本」的演示提示；要测试数据就点左边的按钮
- Not done / risks: 无
- Next step: 无
