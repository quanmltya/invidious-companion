import crypto from "node:crypto";
import type { Config } from "./config.ts";

export const verifyRequest = (
    stringToCheck: string,
    videoId: string,
    config: Config,
): boolean => {
    try {
        const key = Buffer.from(config.server.secret_key, "utf8");
        const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
        
        // Convert base64url to base64
        const base64Str = stringToCheck.replace(/-/g, "+").replace(/_/g, "/");
        
        let decrypted = decipher.update(base64Str, "base64", "utf8");
        decrypted += decipher.final("utf8");

        const [parsedTimestamp, parsedVideoId] = decrypted.split("|");
        const parsedTimestampInt = parseInt(parsedTimestamp, 10);
        const timestampNow = Math.round(Date.now() / 1000);
        if (parsedVideoId !== videoId) {
            return false;
        }
        // only allow ID to live for 6 hours
        if ((timestampNow + 6 * 60 * 60) - parsedTimestampInt < 0) {
            return false;
        }
    } catch (_) {
        return false;
    }
    return true;
};
