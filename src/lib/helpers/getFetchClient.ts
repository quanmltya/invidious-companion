import { fetch as undiciFetch, ProxyAgent, Agent, Pool } from "undici";
import { retry, type RetryOptions } from "./retry.js";
import type { Config } from "./config.js";
import { generateRandomIPv6 } from "./ipv6Rotation.js";
import { connect } from "net";

type FetchInputParameter = Parameters<typeof fetch>[0];
type FetchInitParameterWithDispatcher = RequestInit & { dispatcher?: any };
type FetchReturn = Promise<Response>;

export const getFetchClient = (config: Config): {
    (
        input: FetchInputParameter,
        init?: FetchInitParameterWithDispatcher,
    ): FetchReturn;
} => {
    const proxyAddress = config.networking.proxy;
    const ipv6Block = config.networking.ipv6_block;

    const fetchMaxAttempts = config.networking.fetch?.retry?.times;
    const fetchInitialDebounce = config.networking.fetch?.retry?.initial_debounce;
    const fetchDebounceMultiplier = config.networking.fetch?.retry?.debounce_multiplier;
    const retryOptions: RetryOptions = {
        maxAttempts: fetchMaxAttempts,
        minTimeout: fetchInitialDebounce,
        multiplier: fetchDebounceMultiplier,
    };

    // If proxy or IPv6 rotation is configured
    if (proxyAddress || ipv6Block) {
        // For proxy-only (no IPv6 rotation), reuse a single ProxyAgent
        let reusableDispatcher: any;
        if (proxyAddress && !ipv6Block) {
            reusableDispatcher = new ProxyAgent(proxyAddress);
        }

        return async (
            input: FetchInputParameter,
            init?: FetchInitParameterWithDispatcher,
        ) => {
            let dispatcher: any;
            let shouldClose = false;

            if (reusableDispatcher) {
                dispatcher = reusableDispatcher;
            } else {
                shouldClose = true;
                const localIp = ipv6Block ? generateRandomIPv6(ipv6Block) : undefined;
                if (proxyAddress) {
                    dispatcher = new ProxyAgent({
                        uri: proxyAddress,
                        clientFactory: (origin, opts) => {
                            return new Pool(origin, {
                                ...opts,
                                connect: {
                                    localAddress: localIp,
                                } as any,
                            });
                        },
                    });
                } else {
                    dispatcher = new Agent({
                        connect: (opts, cb) => {
                            const socket = connect({
                                host: opts.hostname,
                                port: Number(opts.port),
                                localAddress: localIp,
                            });

                            cb(null, socket);
                        },
                    });
                }
            }

            const fetchRes = await fetchShim(config, retryOptions, input, {
                ...init,
                dispatcher,
            });

            // If using a reusable dispatcher, return directly
            if (!shouldClose) {
                return fetchRes;
            }

            // For per-request dispatchers (IPv6 rotation), close after body is consumed
            const originalBody = fetchRes.body;
            if (!originalBody) {
                dispatcher.close().catch(() => {});
                return fetchRes;
            }

            const reader = originalBody.getReader();
            const wrappedBody = new ReadableStream({
                async pull(controller) {
                    try {
                        const { done, value } = await reader.read();
                        if (done) {
                            controller.close();
                            dispatcher.close().catch(() => {});
                            return;
                        }
                        controller.enqueue(value);
                    } catch (err) {
                        controller.error(err);
                        dispatcher.close().catch(() => {});
                    }
                },
                cancel() {
                    reader.cancel();
                    dispatcher.close().catch(() => {});
                },
            });

            return new Response(wrappedBody, {
                status: fetchRes.status,
                headers: fetchRes.headers,
            });
        };
    }

    return (input: FetchInputParameter, init?: FetchInitParameterWithDispatcher) =>
        fetchShim(config, retryOptions, input, init);
};

async function fetchShim(
    config: Config,
    retryOptions: RetryOptions,
    input: FetchInputParameter,
    init?: FetchInitParameterWithDispatcher,
): FetchReturn {
    const fetchTimeout = config.networking.fetch?.timeout_ms;
    const fetchRetry = config.networking.fetch?.retry?.enabled;

    const callFetch = () =>
        fetch(input as any, {
            signal: fetchTimeout
                ? AbortSignal.timeout(Number(fetchTimeout))
                : undefined,
            ...(init || {}),
        });

    return fetchRetry ? retry(callFetch, retryOptions) : callFetch();
}
