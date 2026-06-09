export interface RetryOptions {
    maxAttempts?: number;
    minTimeout?: number;
    maxTimeout?: number;
    multiplier?: number;
    jitter?: number;
}

export async function retry<T>(
    fn: () => Promise<T> | T,
    options: RetryOptions = {},
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 5;
    const minTimeout = options.minTimeout ?? 1000;
    const maxTimeout = options.maxTimeout ?? 60000;
    const multiplier = options.multiplier ?? 2;

    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error) {
            attempt++;
            if (attempt >= maxAttempts) {
                throw error;
            }
            const delay = Math.min(
                minTimeout * Math.pow(multiplier, attempt - 1),
                maxTimeout,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}
