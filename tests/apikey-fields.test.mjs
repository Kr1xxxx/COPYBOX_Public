import assert from "node:assert/strict";
import test from "node:test";

const core = await import("../app/apikey-core.ts");
const auto = await import("../app/apikey-automation.ts");

const old = { id: "a1", type: "apikey", name: "旧接口", service: "", key: "key-1234", secret: "sec-5678", endpoint: "", expires: "", createdAt: 1, updatedAt: 2 };

test("entries saved before D-061 read as 密钥 + Secret; an empty secret adds no field", () => {
  assert.deepEqual(core.apiSecretFields(old).map((field) => [field.label, field.value]), [["密钥", "key-1234"], ["Secret", "sec-5678"]]);
  assert.deepEqual(core.apiSecretFields({ ...old, secret: "" }).map((field) => field.label), ["密钥"]);
  assert.deepEqual(core.apiSecretFields({ ...old, fields: [] }).length, 2);
  assert.deepEqual(core.apiSecretFields({ ...old, fields: [{ id: "x" }] }).length, 2);
});

test("stored fields repeat their first two values in key / secret for older app versions", () => {
  const fields = [{ id: "1", label: "Key", value: "k" }, { id: "2", label: "Secret", value: "s" }, { id: "3", label: "Client ID", value: "c" }];
  assert.deepEqual(core.storedApiFields(fields), { fields, key: "k", secret: "s" });
  assert.equal(core.storedApiFields(fields.slice(0, 1)).secret, "");
  assert.deepEqual(core.apiSecretFields({ ...old, ...core.storedApiFields(fields) }), fields);
});

test("checkApiFields trims, drops empty rows and refuses missing, duplicate or digit-only names", () => {
  const ok = core.checkApiFields([{ id: "1", label: " Key ", value: " k-1 \n" }, { id: "2", label: "", value: "" }, { id: "3", label: "Client  ID", value: "c 1" }]);
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.fields, [{ id: "1", label: "Key", value: "k-1" }, { id: "3", label: "Client ID", value: "c 1" }]);
  const bad = core.checkApiFields([{ id: "1", label: "Key", value: "a b" }, { id: "2", label: "key", value: "x" }, { id: "3", label: "", value: "y" }, { id: "4", label: "2", value: "z" }, { id: "5", label: "Token", value: "" }]);
  assert.match(bad.errors["1"].value, /空格/);
  assert.equal(bad.errors["2"].label, "名字重复了");
  assert.ok(bad.errors["3"].label);
  assert.ok(bad.errors["4"].label);
  assert.ok(bad.errors["5"].value);
  assert.ok(core.checkApiFields([{ id: "1", label: "", value: "" }]).errors["1"].value);
});

test("findApiField matches a name in any case, or a 1-based position", () => {
  const fields = core.apiSecretFields(old);
  assert.equal(core.findApiField(fields, "secret")?.value, "sec-5678");
  assert.equal(core.findApiField(fields, "  密钥 ")?.value, "key-1234");
  assert.equal(core.findApiField(fields, "2")?.value, "sec-5678");
  assert.equal(core.findApiField(fields, "3"), undefined);
  assert.equal(core.findApiField(fields, "Client ID"), undefined);
  assert.equal(core.nextFieldLabel([{ id: "1", label: "密钥", value: "" }]), "Secret");
  assert.equal(core.nextFieldLabel([{ id: "1", label: "secret", value: "" }]), "Client ID");
  assert.equal(core.apiKeyHint({ ...old, service: "X" }), "X · 尾号 1234 · 2 项");
});

test("command line: clipbox://apikey/<id> reads the first field by default, or one field by name", () => {
  const item = { ...old, ...core.storedApiFields([{ id: "1", label: "Key", value: "k" }, { id: "2", label: "Client ID", value: "cid" }]), note: "备注" };
  const items = [{ id: "m", type: "mark" }, item];
  const reference = auto.formatApiKeyReference("a1");
  assert.equal(reference, "clipbox://apikey/a1");
  assert.equal(auto.isApiKeySecretCommand({ action: "secret-get", reference }), true);
  assert.equal(auto.isApiKeySecretCommand({ action: "secret-get", reference: "clipbox://secret/a1" }), false);
  assert.equal(auto.isApiKeySecretCommand({ action: "get", reference }), false);
  assert.deepEqual(auto.runApiKeySecretCommand(items, { action: "secret-get", reference }), {
    action: "secret-get",
    secret: { reference, title: "旧接口", value: "k", folder: "", updatedAt: 2, field: "Key", fields: ["Key", "Client ID"], note: "备注" },
  });
  assert.equal(auto.runApiKeySecretCommand(items, { action: "secret-get", reference, field: "client id" }).secret.value, "cid");
  assert.equal(auto.runApiKeySecretCommand(items, { action: "secret-verify", reference, field: "2", candidate: "cid" }).match, true);
  assert.equal(auto.runApiKeySecretCommand(items, { action: "secret-verify", reference, candidate: "cid" }).match, false);
  assert.throws(() => auto.runApiKeySecretCommand(items, { action: "secret-get", reference, field: "Token" }), (error) => error.code === "FIELD_NOT_FOUND" && /Key、Client ID/.test(error.message));
  assert.throws(() => auto.runApiKeySecretCommand(items, { action: "secret-get", reference: "clipbox://apikey/nope" }), { code: "NOT_FOUND" });
  assert.throws(() => auto.runApiKeySecretCommand([{ ...item, trashedAt: 5 }], { action: "secret-get", reference }), { code: "NOT_FOUND" });
  assert.throws(() => auto.runApiKeySecretCommand(items, { action: "secret-get", reference: "clipbox://apikey/a1/x" }), { code: "INVALID_SECRET_REFERENCE" });
  // An old entry (no fields) still answers with its key.
  assert.equal(auto.runApiKeySecretCommand([old], { action: "secret-get", reference }).secret.value, "key-1234");
});

test("old 秘密 references refuse a field instead of ignoring it", async () => {
  const { applySnippetAutomationCommand } = await import("../app/clipbox-automation.ts");
  const vault = { items: [{ id: "s1", kind: "secret", label: "x", secret: "v", folder: "", createdAt: 1, updatedAt: 1 }], folders: [], nextSnippetNumber: 1 };
  const runtime = { createId: () => "id", now: () => 1 };
  assert.equal(applySnippetAutomationCommand(vault, { action: "secret-get", reference: "clipbox://secret/s1" }, runtime).result.secret.value, "v");
  assert.throws(() => applySnippetAutomationCommand(vault, { action: "secret-get", reference: "clipbox://secret/s1", field: "a" }, runtime), { code: "FIELD_NOT_SUPPORTED" });
});
