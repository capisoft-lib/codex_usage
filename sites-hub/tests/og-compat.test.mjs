import assert from "node:assert/strict";
import test from "node:test";
import { ImageResponse } from "@vercel/og";

test("patched OG renderer preserves the ImageResponse PNG API", async () => {
  const response = new ImageResponse({ type: "div", props: {
    style: { display: "flex", background: "#101318", color: "white", width: "100%", height: "100%" },
    children: "Codex forecast <reset> & goals",
  } }, { width: 320, height: 160 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 320);
  assert.equal(png.readUInt32BE(20), 160);
});
