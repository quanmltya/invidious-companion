import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateRandomIPv6 } from "../lib/helpers/ipv6Rotation.js";

describe("generateRandomIPv6 - generates valid IPv6 addresses", () => {
    it("generates valid IPv6 addresses", () => {
        const ipv6Block = "2001:db8::/32";

        // Generate multiple addresses to ensure randomness
        const addresses = new Set<string>();
        for (let i = 0; i < 100; i++) {
            const addr = generateRandomIPv6(ipv6Block);
            addresses.add(addr);

            // Verify the address starts with the correct prefix
            // For /32 block, the first 32 bits should match
            // 2001:db8 = first 32 bits
            const parts = addr.split(":");
            assert.equal(parts[0], "2001");
            assert.equal(parts[1], "db8");
        }

        // Ensure we got different addresses (high probability with randomization)
        // At least 50 unique addresses out of 100 should be generated
        assert.equal(addresses.size > 50, true);
    });
});

describe("generateRandomIPv6 - handles different block sizes", () => {
    it("handles /32 block", () => {
        const addr32 = generateRandomIPv6("2001:db8::/32");
        const parts32 = addr32.split(":");
        assert.equal(parts32[0], "2001");
        assert.equal(parts32[1], "db8");
    });

    it("handles /48 block", () => {
        const addr48 = generateRandomIPv6("2001:db8:1234::/48");
        const parts48 = addr48.split(":");
        assert.equal(parts48[0], "2001");
        assert.equal(parts48[1], "db8");
        assert.equal(parts48[2], "1234");
    });

    it("handles /64 block", () => {
        const addr64 = generateRandomIPv6("2001:db8::/64");
        const parts64 = addr64.split(":");
        assert.equal(parts64[0], "2001");
        assert.equal(parts64[1], "db8");
    });
});

describe("generateRandomIPv6 - throws error for invalid block size", () => {
    it("throws for block size > 128", () => {
        assert.throws(
            () => generateRandomIPv6("2001:db8::/129"),
            /Invalid IPv6 block size/,
        );
    });

    it("throws for block size 0", () => {
        assert.throws(
            () => generateRandomIPv6("2001:db8::/0"),
            /Invalid IPv6 block size/,
        );
    });
});

describe("generateRandomIPv6 - handles compressed IPv6 notation", () => {
    it("generates valid IPv6 from compressed notation", () => {
        const ipv6Block = "2001:db8::/32";
        const addr = generateRandomIPv6(ipv6Block);

        // Address should be valid IPv6
        const parts = addr.split(":");
        assert.equal(parts.length >= 3, true); // At least some parts should be present
        assert.equal(parts[0], "2001");
        assert.equal(parts[1], "db8");
    });
});
