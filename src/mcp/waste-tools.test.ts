import { describe, expect, it } from "vitest";
import { findWasteCollectionAddressesInput, getWasteCollectionsInput } from "./waste-tools";

describe("waste MCP inputs", () => {
  it("bounds address lookup and requires an explicit property ID", () => {
    expect(findWasteCollectionAddressesInput.parse({ postcode: "CF10 1AA" }).limit).toBe(10);
    expect(() => findWasteCollectionAddressesInput.parse({ postcode: "CF10 1AA", limit: 21 })).toThrow();
    expect(getWasteCollectionsInput.parse({ property_id: "1000000000001" }).property_id).toBe("1000000000001");
    expect(() => getWasteCollectionsInput.parse({ property_id: 1000000000001 })).toThrow();
  });
});
