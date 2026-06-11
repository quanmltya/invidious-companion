import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { validateVideoId } from "../lib/helpers/validateVideoId.js";

describe("Video ID validation", () => {
    it("accepts valid YouTube video IDs", () => {
        const validIds = [
            "jNQXAC9IVRw", // Standard video ID from tests
            "dQw4w9WgXcQ", // Rick Roll video
            "aqz-KE-bpKQ", // Video with hyphens
            "A_B_C_D_E_1", // Video with underscores
            "0123456789a", // Numbers and letters
            "ABCDEFGHIJK", // All uppercase
            "abcdefghijk", // All lowercase
            "-_-_-_-_-_-", // Hyphens and underscores
        ];

        for (const id of validIds) {
            assert.equal(
                validateVideoId(id),
                true,
                `Video ID "${id}" should be valid`,
            );
        }
    });

    it("rejects invalid video IDs", () => {
        const invalidIds = [
            "", // Empty string
            "short", // Too short
            "thisistoolongtobeavalidvideoid", // Too long
            "exactly10c", // 10 characters (too short)
            "exactly12chr", // 12 characters (too long)
            "jNQXAC9IVR", // 10 characters
            "jNQXAC9IVRwX", // 12 characters
            "jNQX AC9IVRw", // Contains space
            "jNQX@AC9IVRw", // Contains @
            "jNQX#AC9IVRw", // Contains #
            "jNQX!AC9IVRw", // Contains !
            "jNQX$AC9IVRw", // Contains $
            "jNQX%AC9IVRw", // Contains %
            "jNQX&AC9IVRw", // Contains &
            "jNQX*AC9IVRw", // Contains *
            "jNQX(AC9IVRw", // Contains (
            "jNQX)AC9IVRw", // Contains )
            "jNQX=AC9IVRw", // Contains =
            "jNQX+AC9IVRw", // Contains +
            "jNQX[AC9IVRw", // Contains [
            "jNQX]AC9IVRw", // Contains ]
            "jNQX{AC9IVRw", // Contains {
            "jNQX}AC9IVRw", // Contains }
            "jNQX|AC9IVRw", // Contains |
            "jNQX\\AC9IVRw", // Contains \
            "jNQX/AC9IVRw", // Contains /
            "jNQX:AC9IVRw", // Contains :
            "jNQX;AC9IVRw", // Contains ;
            "jNQX'AC9IVRw", // Contains '
            'jNQX"AC9IVRw', // Contains "
            "jNQX<AC9IVRw", // Contains <
            "jNQX>AC9IVRw", // Contains >
            "jNQX,AC9IVRw", // Contains ,
            "jNQX.AC9IVRw", // Contains .
            "jNQX?AC9IVRw", // Contains ?
            "../../../etc", // Path traversal attempt
            "'; DROP TABLE", // SQL injection attempt
            "<script>xss", // XSS attempt (11 chars but invalid)
        ];

        for (const id of invalidIds) {
            assert.equal(
                validateVideoId(id),
                false,
                `Video ID "${id}" should be invalid`,
            );
        }
    });

    it("handles edge cases", () => {
        // Test null/undefined handling with proper type casting
        assert.equal(
            validateVideoId(null as unknown as string),
            false,
            "null should be invalid",
        );
        assert.equal(
            validateVideoId(undefined as unknown as string),
            false,
            "undefined should be invalid",
        );

        // Test numbers
        assert.equal(
            validateVideoId(12345678901 as unknown as string),
            false,
            "Number should be invalid",
        );
    });
});
