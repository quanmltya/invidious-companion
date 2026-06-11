import crypto from "node:crypto";
import type { Config } from "./config.js";

export const encryptQuery = (
    queryParams: string,
    config: Config,
): string => {
    try {
        const key = Buffer.from(config.server.secret_key, "utf8");
        const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
        let encrypted = cipher.update(queryParams, "utf8", "base64");
        encrypted += cipher.final("base64");
        return encrypted;
    } catch (err) {
        console.error("[ERROR] Failed to encrypt query parameters:", err);
        return "";
    }
};

export const decryptQuery = (
    queryParams: string,
    config: Config,
): string => {
    try {
        const key = Buffer.from(config.server.secret_key, "utf8");
        const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
        let decrypted = decipher.update(queryParams, "base64", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (err) {
        console.error("[ERROR] Failed to decrypt query parameters:", err);
        return "";
    }
};
