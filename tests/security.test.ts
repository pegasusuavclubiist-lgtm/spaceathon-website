import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newId, newUploadToken, safeEqual, sha256Hex, sniffIdFile } from "../lib/security";

describe("sniffIdFile", () => {
  it("recognises PDF, JPEG, PNG and WebP by magic bytes", () => {
    assert.equal(sniffIdFile(Buffer.from("%PDF-1.7 ...")), "pdf");
    assert.equal(sniffIdFile(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0])), "jpeg");
    assert.equal(sniffIdFile(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
    assert.equal(sniffIdFile(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1")), "webp");
  });

  it("rejects everything else, whatever the filename claims", () => {
    assert.equal(sniffIdFile(Buffer.from("<script>alert(1)</script>")), null);
    assert.equal(sniffIdFile(Buffer.from("MZ\x90\x00", "latin1")), null);
    assert.equal(sniffIdFile(new Uint8Array(0)), null);
  });
});

describe("tokens and ids", () => {
  it("generates unique, well-formed values", () => {
    assert.match(newId("reg"), /^reg_[0-9a-f]{20}$/);
    assert.match(newId("msg"), /^msg_[0-9a-f]{20}$/);
    assert.notEqual(newUploadToken(), newUploadToken());
    assert.ok(newUploadToken().length >= 43);
  });

  it("compares strings safely", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", ""), false);
    assert.equal(sha256Hex("a").length, 64);
  });
});
