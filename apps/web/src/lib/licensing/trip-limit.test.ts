import assert from "node:assert/strict";
import test from "node:test";

import { tripLimitMessage } from "./trip-limit";

test("names the plan's real limit", () => {
  assert.equal(
    tripLimitMessage(5),
    "Você atingiu o limite de 5 viagens do seu plano atual. Ative uma nova key para continuar criando viagens.",
  );
  assert.match(tripLimitMessage(10), /limite de 10 viagens/);
});

test("uses the singular for one trip", () => {
  assert.match(tripLimitMessage(1), /limite de 1 viagem do seu plano/);
});

test("stays correct when the limit is unknown", () => {
  for (const value of [null, undefined, Number.NaN, -1]) {
    const message = tripLimitMessage(value);
    assert.match(message, /Você atingiu o limite de viagens do seu plano atual\./);
    assert.match(message, /Ative uma nova key/);
  }
});
