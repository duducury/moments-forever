import assert from "node:assert/strict";
import test from "node:test";

import { absoluteUrl, getSiteUrl } from "./site-url";

test("getSiteUrl prefers the stable production host over unique Vercel URLs", () => {
  const previous = {
    site: process.env.NEXT_PUBLIC_SITE_URL,
    production: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercel: process.env.VERCEL_URL,
  };

  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "moments-forever-web.vercel.app";
  process.env.VERCEL_URL =
    "moments-forever-m4clib3cn-eduardo-curys-projects.vercel.app";

  try {
    assert.equal(getSiteUrl(), "https://moments-forever-web.vercel.app");
    assert.equal(
      absoluteUrl("/duducury1998-w1dd"),
      "https://moments-forever-web.vercel.app/duducury1998-w1dd",
    );
  } finally {
    if (previous.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous.site;
    if (previous.production === undefined) {
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    } else {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = previous.production;
    }
    if (previous.vercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = previous.vercel;
  }
});
