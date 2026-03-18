import { describe, it, expect } from "vitest";
import { Feedbackiq } from "../src/core.js";
describe("Feedbackiq", () => {
  it("init", () => { expect(new Feedbackiq().getStats().ops).toBe(0); });
  it("op", async () => { const c = new Feedbackiq(); await c.process(); expect(c.getStats().ops).toBe(1); });
  it("reset", async () => { const c = new Feedbackiq(); await c.process(); c.reset(); expect(c.getStats().ops).toBe(0); });
});
