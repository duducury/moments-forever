import assert from "node:assert/strict";
import test from "node:test";

import {
  isSafeOwnerHomePath,
  readOwnerHomeCache,
  serializeOwnerHomeCache,
} from "./owner-home-cache";

test("readOwnerHomeCache returns the path only for the same user and a relative path", () => {
  const raw = serializeOwnerHomeCache({ userId: "user-1", path: "/ana" });
  assert.equal(readOwnerHomeCache(raw, "user-1"), "/ana");
  assert.equal(readOwnerHomeCache(raw, "user-2"), null);
  assert.equal(readOwnerHomeCache(null, "user-1"), null);
  assert.equal(
    readOwnerHomeCache(
      serializeOwnerHomeCache({ userId: "user-1", path: "https://evil.example" }),
      "user-1",
    ),
    null,
  );
  assert.equal(
    readOwnerHomeCache(
      serializeOwnerHomeCache({ userId: "user-1", path: "//evil.example" }),
      "user-1",
    ),
    null,
  );
  assert.equal(
    readOwnerHomeCache(
      serializeOwnerHomeCache({ userId: "user-1", path: "/perfil" }),
      "user-1",
    ),
    null,
  );
  assert.equal(isSafeOwnerHomePath("/ana"), true);
  assert.equal(isSafeOwnerHomePath("/perfil"), false);
  assert.equal(isSafeOwnerHomePath("/login"), false);
});
