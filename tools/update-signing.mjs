// Signs the Windows installer so the app only installs updates made by us (D-053). Minisign format (Ed25519 over the
// BLAKE2b-512 of the file, "prehashed"), written with Node's own crypto: no new dependency. The app checks it with the
// `minisign-verify` crate against src-tauri/update-public-key.txt; any `minisign -V` can check it too.
//
//   node tools/update-signing.mjs keygen --out copyboxx-update-key.txt     (asks for a password, or UPDATE_SIGNING_PASSWORD)
//   node tools/update-signing.mjs sign --version 1.80.0 <installer>        (UPDATE_SIGNING_KEY + UPDATE_SIGNING_PASSWORD; writes <installer>.sig)
//   node tools/update-signing.mjs verify --version 1.80.0 <installer>      (checks <installer>.sig against the app's public key)
//
// The private key file is the GitHub secret UPDATE_SIGNING_KEY (environment `update-signing`, main only) and the
// owner's offline backup. It is encrypted with the password; neither ever goes into the repo or a chat.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const publicKeyPath = resolve(here, "../src-tauri/update-public-key.txt");

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const KEY_HEADER = "untrusted comment: Copyboxx update signing key. SECRET: never share, never commit.";
const MIN_PASSWORD = 12;

function keyIdHex(keyId) {
  return Buffer.from(keyId).toString("hex").toUpperCase();
}

// The public key as minisign writes it: a comment line and base64("Ed" ‖ key id ‖ 32-byte key).
export function publicKeyText(rawPublicKey, keyId) {
  const line = Buffer.concat([Buffer.from("Ed"), keyId, rawPublicKey]).toString("base64");
  return `untrusted comment: Copyboxx update public key ${keyIdHex(keyId)}\n${line}\n`;
}

export function parsePublicKey(text) {
  const line = String(text).split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("untrusted comment:"));
  const bin = Buffer.from(line ?? "", "base64");
  if (bin.length !== 42 || bin.subarray(0, 2).toString() !== "Ed") throw new Error("Not a minisign public key.");
  const keyId = bin.subarray(2, 10);
  const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, bin.subarray(10)]), format: "der", type: "spki" });
  return { keyId, key };
}

// A new key pair. The private key file holds the key id and the PKCS#8 key encrypted with the password.
export function generateKey(password) {
  if (String(password ?? "").length < MIN_PASSWORD) throw new Error(`The password needs at least ${MIN_PASSWORD} characters.`);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = randomBytes(8);
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(SPKI_ED25519_PREFIX.length);
  const pem = privateKey.export({ format: "pem", type: "pkcs8", cipher: "aes-256-cbc", passphrase: password });
  return { secret: `${KEY_HEADER}\nkeyid:${keyIdHex(keyId)}\n${pem}`, public: publicKeyText(raw, keyId) };
}

export function parseSecretKey(text, password) {
  const value = String(text ?? "").replace(/\r\n/g, "\n");
  const id = /^keyid:([0-9A-F]{16})$/m.exec(value);
  const pem = /-----BEGIN ENCRYPTED PRIVATE KEY-----[\s\S]+?-----END ENCRYPTED PRIVATE KEY-----/.exec(value);
  if (!id || !pem) throw new Error("UPDATE_SIGNING_KEY is not a Copyboxx update signing key.");
  let key;
  try {
    key = createPrivateKey({ key: pem[0], format: "pem", passphrase: String(password ?? "") });
  } catch {
    throw new Error("The update signing key could not be opened: wrong UPDATE_SIGNING_PASSWORD?");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new Error("The update signing key is not Ed25519.");
  return { keyId: Buffer.from(id[1], "hex"), key };
}

// The trusted comment: signed together with the signature, so the version cannot be swapped (no downgrades).
export function trustedComment(version, fileName, timestamp = Math.floor(Date.now() / 1000)) {
  if (!/^\d+\.\d+\.\d+$/.test(String(version))) throw new Error(`The signature needs an app version like 1.80.0, got "${version}".`);
  if (!/^[A-Za-z0-9._-]+$/.test(String(fileName))) throw new Error(`Unexpected installer name "${fileName}".`);
  return `version:${version}\tfile:${fileName}\ttimestamp:${timestamp}`;
}

export function signBytes(bytes, secretKey, comment) {
  const digest = createHash("blake2b512").update(bytes).digest();
  const signature = sign(null, digest, secretKey.key);
  const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), secretKey.key);
  const first = Buffer.concat([Buffer.from("ED"), secretKey.keyId, signature]).toString("base64");
  return `untrusted comment: signature from Copyboxx update key ${keyIdHex(secretKey.keyId)}\n${first}\ntrusted comment: ${comment}\n${global.toString("base64")}\n`;
}

// Checks a .sig the way the app does; returns the fields of its trusted comment or throws.
export function verifyBytes(bytes, signatureText, publicKey) {
  const lines = String(signatureText ?? "").replace(/\r\n/g, "\n").split("\n");
  const first = Buffer.from(lines[1] ?? "", "base64");
  if (first.length !== 74 || !lines[2]?.startsWith("trusted comment: ")) throw new Error("The signature is not in minisign format.");
  if (first.subarray(0, 2).toString() !== "ED") throw new Error("The signature is not prehashed (ED).");
  if (!first.subarray(2, 10).equals(publicKey.keyId)) throw new Error("The signature was made with another key.");
  const comment = lines[2].slice("trusted comment: ".length);
  const global = Buffer.from(lines[3] ?? "", "base64");
  const signature = first.subarray(10);
  const digest = createHash("blake2b512").update(bytes).digest();
  if (!verify(null, digest, publicKey.key, signature)) throw new Error("The signature does not match the installer.");
  if (global.length !== 64 || !verify(null, Buffer.concat([signature, Buffer.from(comment)]), publicKey.key, global)) throw new Error("The trusted comment was changed.");
  return Object.fromEntries(comment.split("\t").map((part) => [part.slice(0, part.indexOf(":")), part.slice(part.indexOf(":") + 1)]));
}

// Throws unless the signature is good and names exactly this version.
export function checkInstallerSignature(bytes, signatureText, version, publicKeyFileText = readFileSync(publicKeyPath, "utf8")) {
  const fields = verifyBytes(bytes, signatureText, parsePublicKey(publicKeyFileText));
  if (fields.version !== version) throw new Error(`The signature is for version ${fields.version || "?"}, not ${version}.`);
  return fields;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return "";
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

function lastArgument(argv) {
  const rest = argv.filter((arg, i) => !arg.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  return rest.at(-1) ?? "";
}

async function askPassword() {
  if (process.env.UPDATE_SIGNING_PASSWORD) return process.env.UPDATE_SIGNING_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const first = await rl.question(`Password for the key (at least ${MIN_PASSWORD} characters, write it down): `);
    const second = await rl.question("Same password again: ");
    if (first !== second) throw new Error("The two passwords differ.");
    return first;
  } finally {
    rl.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === "keygen") {
    const out = resolve(option(rest, "--out") || "copyboxx-update-key.txt");
    if (existsSync(out)) throw new Error(`${out} already exists; a new key would replace it.`);
    const pair = generateKey(await askPassword());
    writeFileSync(out, pair.secret, { mode: 0o600 });
    writeFileSync(`${out}.pub`, pair.public);
    console.log(`private key (secret, keep a backup): ${out}`);
    console.log(`public key (safe to share): ${out}.pub`);
    console.log(pair.public.trim());
    return;
  }
  if (command === "sign" || command === "verify") {
    const version = option(rest, "--version");
    const file = resolve(lastArgument(rest));
    const bytes = readFileSync(file);
    const sigPath = `${file}.sig`;
    if (command === "sign") {
      const secretKey = parseSecretKey(process.env.UPDATE_SIGNING_KEY, process.env.UPDATE_SIGNING_PASSWORD);
      const signature = signBytes(bytes, secretKey, trustedComment(version, basename(file)));
      writeFileSync(sigPath, signature);
      console.log(`signed ${basename(file)} as version ${version} → ${basename(sigPath)}`);
    }
    // UPDATE_PUBLIC_KEY_FILE is for tests only; CI checks against the key the app is built with.
    const keyFile = process.env.UPDATE_PUBLIC_KEY_FILE || publicKeyPath;
    const fields = checkInstallerSignature(bytes, readFileSync(sigPath, "utf8"), version, readFileSync(keyFile, "utf8"));
    console.log(`signature ok for ${fields.file} version ${fields.version} with ${basename(keyFile)}`);
    return;
  }
  throw new Error("Usage: update-signing.mjs keygen --out <file> | sign --version X <installer> | verify --version X <installer>");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
