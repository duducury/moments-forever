import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { canShareNatively, copyLink, isShareCancellation, shareLink } from "./share-link";

const URL_ALBUM = "https://momentsforever.vercel.app/perfil/dubai/album/6f1c";
const URL_NFC = "https://momentsforever.vercel.app/n/abc123";

function fakeClipboard(fail = false) {
  const copied: string[] = [];
  return {
    copied,
    nav: {
      clipboard: {
        async writeText(text: string) {
          if (fail) throw new Error("blocked");
          copied.push(text);
        },
      },
    },
  };
}

test("with navigator.share: it is called with exactly the page URL, title and text", async () => {
  const calls: unknown[] = [];
  const clip = fakeClipboard();
  const result = await shareLink(
    { url: URL_ALBUM, title: "Viagem no Moments Forever", text: "Veja esta viagem no Moments Forever." },
    {
      navigator: {
        ...clip.nav,
        async share(data) {
          calls.push(data);
        },
      },
    },
  );
  assert.equal(result, "shared");
  assert.deepEqual(calls, [
    { url: URL_ALBUM, title: "Viagem no Moments Forever", text: "Veja esta viagem no Moments Forever." },
  ]);
  assert.deepEqual(clip.copied, [], "nothing is copied behind the person's back");
});

test("the shared URL is passed through untouched (NFC links stay plain https URLs)", async () => {
  const calls: Array<{ url?: string }> = [];
  await shareLink({ url: URL_NFC }, { navigator: { async share(data) { calls.push(data); } } });
  assert.deepEqual(calls, [{ url: URL_NFC }]);
});

test("without navigator.share: falls back to copying the link", async () => {
  const clip = fakeClipboard();
  assert.equal(canShareNatively({}), false);
  assert.equal(await shareLink({ url: URL_ALBUM, title: "x" }, { navigator: clip.nav }), "copied");
  assert.deepEqual(clip.copied, [URL_ALBUM]);
});

test("closing the share sheet is a cancellation: no error, no copy", async () => {
  const clip = fakeClipboard();
  for (const error of [
    Object.assign(new Error("Share canceled"), { name: "AbortError" }),
    Object.assign(new Error("aborted"), { code: 20 }),
  ]) {
    const result = await shareLink(
      { url: URL_ALBUM },
      {
        navigator: {
          ...clip.nav,
          async share() {
            throw error;
          },
        },
      },
    );
    assert.equal(result, "cancelled");
  }
  assert.deepEqual(clip.copied, []);
  assert.equal(isShareCancellation(new Error("boom")), false);
});

test("a refused share (no user gesture left) falls back to copying instead of failing", async () => {
  const clip = fakeClipboard();
  const result = await shareLink(
    { url: URL_ALBUM },
    {
      navigator: {
        ...clip.nav,
        async share() {
          throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
        },
      },
    },
  );
  assert.equal(result, "copied");
  assert.deepEqual(clip.copied, [URL_ALBUM]);
});

test("copy falls back to the textarea route when the Clipboard API is missing or blocked", async () => {
  for (const nav of [{}, fakeClipboard(true).nav]) {
    const events: string[] = [];
    const field = {
      value: "",
      style: {} as Record<string, string>,
      setAttribute() {},
      select() {
        events.push(`select:${field.value}`);
      },
    };
    const doc = {
      body: { appendChild() { events.push("append"); }, removeChild() { events.push("remove"); } },
      createElement: () => field,
      execCommand(command: "copy") {
        events.push(command);
        return true;
      },
    };
    assert.equal(await copyLink(URL_NFC, { navigator: nav, document: doc }), "copied");
    assert.deepEqual(events, ["append", `select:${URL_NFC}`, "copy", "remove"]);
  }
  assert.equal(await copyLink(URL_NFC, { navigator: {}, document: undefined }), "failed" /* no DOM in node */);
});

test("only real http(s) URLs are shared", async () => {
  let called = false;
  const nav = { async share() { called = true; } };
  for (const url of ["", "not a url", "javascript:alert(1)", "/perfil", "file:///etc/passwd"]) {
    assert.equal(await shareLink({ url }, { navigator: nav }), "failed", url);
  }
  assert.equal(called, false);
});

// ---- Every place that shares/copies a link goes through the central module ----

const WEB = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(WEB, file), "utf8");

test("the page-link button and the profile menu share through shareLink()", () => {
  const button = read("src/components/copy-page-link-button.tsx");
  assert.match(button, /from "@\/lib\/share\/share-link"/);
  assert.match(button, /await shareLink\(\{/);
  assert.match(button, /window\.location\.href/, "the real page URL");
  assert.match(button, /\/api\/albums\/\$\{albumId\}\/short-link/, "albums keep their real short link");
  assert.doesNotMatch(button, /navigator\.clipboard|execCommand/, "no private copy code left");

  const menu = read("src/components/profile-user-menu.tsx");
  assert.match(menu, /shareLink as shareLinkNatively/);
  assert.match(menu, /await shareLinkNatively\(\{/);
  assert.match(menu, /Copiar link/, "direct copy is still offered");
  assert.match(menu, />\s*Compartilhar\s*</);
  assert.doesNotMatch(menu, /navigator\.share|navigator\.clipboard/);
});

test("the NFC link copy buttons use the central copy, and nothing else copies links by hand", () => {
  for (const file of [
    "src/app/trip/[slug]/album/[albumId]/nfc-link-panel.tsx",
    "src/app/geral/nfc/nfc-manager-client.tsx",
    "src/app/perfil/edit-trip-dialog.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /import \{ copyLink \} from "@\/lib\/share\/share-link"/, file);
    assert.doesNotMatch(source, /navigator\.clipboard/, file);
    assert.match(source, /Copiar|Copiado/, `${file} keeps its copy button`);
  }
});

test("no new dependency was added for sharing", () => {
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
  assert.equal(Object.keys(pkg.dependencies).some((name) => name.includes("capacitor/share")), false);
});
