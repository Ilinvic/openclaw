import { describe, expect, it } from "vitest";

import { __test__buildPifMenuButtons } from "./commands-trading.js";

describe("Pif trading menu", () => {
  it("shows a Traders button wired to the traders view", () => {
    const buttons = __test__buildPifMenuButtons();
    const flat = buttons.flat();

    expect(flat).toContainEqual({ text: "Трейдеры", callback_data: "pif traders" });
  });
});
