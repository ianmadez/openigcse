import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { MAX_UPLOAD_BYTES, storagePath, validateUpload } from "./rules";

describe("validateUpload", () => {
  test("accepts the four allowed types up to 15 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      assert.deepEqual(validateUpload({ type, size: MAX_UPLOAD_BYTES }), { ok: true, extension: type.split("/")[1] === "jpeg" ? "jpg" : type.split("/")[1] });
    }
  });

  test("refuses anything over 15 MB", () => {
    assert.equal(validateUpload({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 }).ok, false);
    assert.equal(MAX_UPLOAD_BYTES, 15 * 1024 * 1024);
  });

  test("refuses other types and empty files", () => {
    assert.equal(validateUpload({ type: "image/gif", size: 10 }).ok, false);
    assert.equal(validateUpload({ type: "text/html", size: 10 }).ok, false);
    assert.equal(validateUpload({ type: "image/png", size: 0 }).ok, false);
  });
});

describe("storagePath", () => {
  test("puts the household first and the uploader third", () => {
    const path = storagePath("h1", "working", "p1", "png");
    assert.match(path, /^h1\/working\/p1\/[0-9a-f-]{36}\.png$/);
  });
});
