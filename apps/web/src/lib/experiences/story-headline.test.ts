import assert from "node:assert/strict";
import test from "node:test";

import { splitStoryHeadline } from "./story-headline";

test("first line becomes the headline, last two words are the accent", () => {
  const r = splitStoryHeadline(
    "Dubai estava extremamente quente\ne quase morremos de calor, achamos incluir a nossa vida shaik.",
  );
  assert.deepEqual(r, {
    lead: "Dubai estava",
    accent: "extremamente quente",
    body: "e quase morremos de calor, achamos incluir a nossa vida shaik.",
  });
});

test("a short first sentence is the headline when more text follows", () => {
  const r = splitStoryHeadline("A energia de Texas. Entre boas companhias, novos lugares.");
  assert.equal(r?.lead, "A energia");
  assert.equal(r?.accent, "de Texas");
  assert.equal(r?.body, "Entre boas companhias, novos lugares.");
});

test("a short single clause is a headline on its own", () => {
  const r = splitStoryHeadline("foi top,");
  assert.deepEqual(r, { lead: "foi", accent: "top", body: "" });
});

test("a long single sentence has no headline and is never altered", () => {
  const text =
    "Entre boas companhias e novos lugares e paisagens incríveis essa viagem ficou para sempre na memória de todos nós";
  assert.equal(splitStoryHeadline(text), null);
});

test("empty story has no headline", () => {
  assert.equal(splitStoryHeadline("   "), null);
});
