import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("Secret key validation in Invidious companion config", () => {
    const originalKey = process.env.SERVER_SECRET_KEY;

    afterEach(() => {
        // Restore or clear the environment variable after each test
        if (originalKey !== undefined) {
            process.env.SERVER_SECRET_KEY = originalKey;
        } else {
            delete process.env.SERVER_SECRET_KEY;
        }
    });

    it("accepts valid alphanumeric keys", async () => {
        const validKeys = [
            "aaaaaaaaaaaaaaaa", // all lowercase
            "AAAAAAAAAAAAAAAA", // all uppercase
            "1234567890123456", // all numbers
            "Aa1Bb2Cc3Dd4Ee5F", // mixed case
            "ABC123DEF456789A", // mixed letters and numbers
        ];

        for (const key of validKeys) {
            process.env.SERVER_SECRET_KEY = key;
            // Need to re-import parseConfig with fresh env so we use dynamic import trick
            const { parseConfig } = await import("../lib/helpers/config.js");
            const config = await parseConfig();
            assert.equal(
                config.server.secret_key,
                key,
                `Key "${key}" should be accepted and stored correctly`,
            );
        }
    });

    it("rejects keys with special characters", async () => {
        const invalidKeys = [
            "my#key!123456789", // Contains # and !
            "test@key12345678", // Contains @
            "key-with-dashes1", // Contains -
            "key_with_under_s", // Contains _
            "key with spaces1", // Contains spaces
            "key$with$dollar$", // Contains $
            "key+with+plus+12", // Contains +
            "key=with=equals=", // Contains =
            "key(with)parens1", // Contains ()
            "key[with]bracket", // Contains []
        ];

        for (const key of invalidKeys) {
            process.env.SERVER_SECRET_KEY = key;
            const { parseConfig } = await import("../lib/helpers/config.js");
            await assert.rejects(
                async () => parseConfig(),
                (err: Error) => {
                    assert.ok(err.message.includes("Failed to parse configuration"), `Key "${key}" should fail`);
                    return true;
                },
            );
        }
    });

    it("rejects keys with wrong length", async () => {
        const wrongLengthKeys = [
            "short", // Too short
            "thiskeyistoolongtobevalid", // Too long
            "", // Empty
            "a", // Single character
            "exactly15chars!", // 15 chars (invalid char)
        ];

        for (const key of wrongLengthKeys) {
            process.env.SERVER_SECRET_KEY = key;
            const { parseConfig } = await import("../lib/helpers/config.js");
            await assert.rejects(
                async () => parseConfig(),
                (err: Error) => {
                    assert.ok(err.message.includes("Failed to parse configuration"), `Key "${key}" should fail`);
                    return true;
                },
            );
        }
    });

    it("validates error message content - special chars", async () => {
        process.env.SERVER_SECRET_KEY = "my#key!123456789";
        const { parseConfig } = await import("../lib/helpers/config.js");
        await assert.rejects(
            async () => parseConfig(),
            (err: Error) => {
                const errStr = err.toString();
                assert.ok(
                    errStr.includes("SERVER_SECRET_KEY contains invalid characters") ||
                        errStr.includes("alphanumeric characters"),
                    "Should mention SERVER_SECRET_KEY and character validation",
                );
                return true;
            },
        );
    });

    it("validates error message content - short key", async () => {
        process.env.SERVER_SECRET_KEY = "short";
        const { parseConfig } = await import("../lib/helpers/config.js");
        await assert.rejects(
            async () => parseConfig(),
            (err: Error) => {
                const errStr = err.toString();
                assert.ok(
                    errStr.includes("exactly 16 character") ||
                        errStr.includes("String must contain exactly 16 character"),
                    `Should mention 16 characters: ${errStr}`,
                );
                return true;
            },
        );
    });

    it("rejects missing SERVER_SECRET_KEY", async () => {
        delete process.env.SERVER_SECRET_KEY;
        const { parseConfig } = await import("../lib/helpers/config.js");
        await assert.rejects(
            async () => parseConfig(),
            (err: Error) => {
                const errStr = err.toString();
                assert.ok(
                    errStr.includes("exactly 16 character") ||
                        errStr.includes("String must contain exactly 16 character"),
                    `Should get length error for empty key: ${errStr}`,
                );
                return true;
            },
        );
    });
});
