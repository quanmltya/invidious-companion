import { existsSync, promises as fs } from "node:fs";
import { join } from "node:path";

export class FileKv {
    private cacheDir: string;

    constructor(cacheDir: string) {
        this.cacheDir = cacheDir;
    }

    private getFilePath(key: string): string {
        // Replace any potential invalid characters in key to make it a safe filename
        const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, "_");
        return join(this.cacheDir, `vc_${safeKey}.bin`);
    }

    async get(keyParts: [string, string]): Promise<{ value: Uint8Array | null }> {
        const key = keyParts[1];
        const filePath = this.getFilePath(key);
        try {
            if (!existsSync(filePath)) {
                return { value: null };
            }
            const data = await fs.readFile(filePath);
            if (data.length < 8) {
                return { value: null };
            }
            // Read expiration time from first 8 bytes (bigint)
            const expireAt = Number(data.readBigInt64BE(0));
            if (Date.now() > expireAt) {
                // Expired! Delete file in background
                fs.unlink(filePath).catch(() => {});
                return { value: null };
            }
            // Slice off the first 8 bytes of expiration timestamp to get the actual value
            const value = new Uint8Array(data.subarray(8));
            return { value };
        } catch (err) {
            console.error(`[WARN] KV get failed for ${key}:`, err);
            return { value: null };
        }
    }

    async set(
        keyParts: [string, string],
        value: Uint8Array,
        options?: { expireIn?: number },
    ): Promise<void> {
        const key = keyParts[1];
        const filePath = this.getFilePath(key);
        try {
            // Ensure directory exists
            await fs.mkdir(this.cacheDir, { recursive: true });
            
            const expireIn = options?.expireIn ?? (1000 * 60 * 60);
            const expireAt = BigInt(Date.now() + expireIn);

            const buffer = Buffer.alloc(8 + value.length);
            buffer.writeBigInt64BE(expireAt, 0);
            buffer.set(value, 8);

            await fs.writeFile(filePath, buffer);
        } catch (err) {
            console.error(`[WARN] KV set failed for ${key}:`, err);
        }
    }
}
