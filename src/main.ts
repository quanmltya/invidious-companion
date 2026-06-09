import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createAdaptorServer } from "@hono/node-server";
import { existsSync, unlinkSync, chmodSync } from "node:fs";
import { companionRoutes, miscRoutes } from "./routes/index.ts";
import { Innertube, Platform } from "youtubei.js";
import { poTokenGenerate, type TokenMinter } from "./lib/jobs/potoken.ts";
import { USER_AGENT } from "bgutils";
import { retry } from "./lib/helpers/retry.ts";
import type { HonoVariables } from "./lib/types/HonoVariables.ts";
import minimist from "minimist";

import { parseConfig } from "./lib/helpers/config.ts";
const config = await parseConfig();
import { Metrics } from "./lib/helpers/metrics.ts";
import { PLAYER_ID } from "./constants.ts";
import { jsInterpreter } from "./lib/helpers/jsInterpreter.ts";

const args = minimist(process.argv.slice(2));

if (args._version_date && args._version_commit) {
    console.log(
        `[INFO] Using Invidious companion version ${args._version_date}-${args._version_commit}`,
    );
}

let getFetchClientLocation = "./lib/helpers/getFetchClient.js";
if (process.env.GET_FETCH_CLIENT_LOCATION) {
    getFetchClientLocation = process.env.GET_FETCH_CLIENT_LOCATION;
}
const { getFetchClient } = await import(getFetchClientLocation);

declare module "hono" {
    interface ContextVariableMap extends HonoVariables {}
}

const app = new Hono({
    getPath: (req) => new URL(req.url).pathname,
});
const companionApp = new Hono({
    getPath: (req) => new URL(req.url).pathname,
}).basePath(config.server.base_path);
const metrics = config.server.enable_metrics ? new Metrics() : undefined;

let tokenMinter: TokenMinter | undefined;
let innertubeClient: Innertube;
let innertubeClientFetchPlayer = true;
const innertubeClientOauthEnabled = config.youtube_session.oauth_enabled;
const innertubeClientJobPoTokenEnabled =
    config.jobs.youtube_session.po_token_enabled;
const innertubeClientCookies = config.youtube_session.cookies;

// Promise that resolves when tokenMinter initialization is complete (for tests)
let tokenMinterReadyResolve: (() => void) | undefined;
export const tokenMinterReady = new Promise<void>((resolve) => {
    tokenMinterReadyResolve = resolve;
});

if (!innertubeClientOauthEnabled) {
    if (innertubeClientJobPoTokenEnabled) {
        console.log("[INFO] job po_token is active.");
        // Don't fetch fetch player yet for po_token
        innertubeClientFetchPlayer = false;
    } else if (!innertubeClientJobPoTokenEnabled) {
        console.log("[INFO] job po_token is NOT active.");
    }
}

Platform.shim.eval = jsInterpreter;

innertubeClient = await Innertube.create({
    enable_session_cache: false,
    retrieve_player: innertubeClientFetchPlayer,
    fetch: getFetchClient(config),
    cookie: innertubeClientCookies || undefined,
    user_agent: USER_AGENT,
    player_id: PLAYER_ID,
});

if (!innertubeClientOauthEnabled) {
    if (innertubeClientJobPoTokenEnabled) {
        // Initialize tokenMinter in background to not block server startup
        console.log("[INFO] Starting PO token generation in background...");
        retry(
            () => poTokenGenerate(config, metrics),
            { minTimeout: 1_000, maxTimeout: 60_000, multiplier: 5 },
        ).then((result) => {
            innertubeClient = result.innertubeClient;
            tokenMinter = result.tokenMinter;
            tokenMinterReadyResolve?.();
        }).catch((err) => {
            console.error("[ERROR] Failed to initialize PO token:", err);
            metrics?.potokenGenerationFailure.inc();
            tokenMinterReadyResolve?.();
        });
    } else {
        // If PO token is not enabled, resolve immediately
        tokenMinterReadyResolve?.();
    }

    import("node-cron").then((cron) => {
        cron.default.schedule(
            config.jobs.youtube_session.frequency,
            async () => {
                if (innertubeClientJobPoTokenEnabled) {
                    try {
                        ({ innertubeClient, tokenMinter } = await poTokenGenerate(
                            config,
                            metrics,
                        ));
                    } catch (err) {
                        metrics?.potokenGenerationFailure.inc();
                        console.error("[ERROR] Failed to regenerate PO token in cron job:", err);
                    }
                } else {
                    try {
                        innertubeClient = await Innertube.create({
                            enable_session_cache: false,
                            fetch: getFetchClient(config),
                            retrieve_player: innertubeClientFetchPlayer,
                            user_agent: USER_AGENT,
                            cookie: innertubeClientCookies || undefined,
                            player_id: PLAYER_ID,
                        });
                    } catch (err) {
                        console.error("[ERROR] Failed to recreate session in cron job:", err);
                    }
                }
            },
        );
    });
} else if (innertubeClientOauthEnabled) {
    // Fired when waiting for the user to authorize the sign in attempt.
    innertubeClient.session.on("auth-pending", (data) => {
        console.log(
            `[INFO] [OAUTH] Go to ${data.verification_url} in your browser and enter code ${data.user_code} to authenticate.`,
        );
    });
    // Fired when authentication is successful.
    innertubeClient.session.on("auth", () => {
        console.log("[INFO] [OAUTH] Sign in successful!");
    });
    // Fired when the access token expires.
    innertubeClient.session.on("update-credentials", async () => {
        console.log("[INFO] [OAUTH] Credentials updated.");
        await innertubeClient.session.oauth.cacheCredentials();
    });

    // Attempt to sign in and then cache the credentials
    await innertubeClient.session.signIn();
    await innertubeClient.session.oauth.cacheCredentials();
    // Resolve promise for tests
    tokenMinterReadyResolve?.();
}

companionApp.use("*", async (c, next) => {
    c.set("innertubeClient", innertubeClient);
    c.set("tokenMinter", tokenMinter);
    c.set("config", config);
    c.set("metrics", metrics);
    await next();
});
companionRoutes(companionApp, config);

app.use("*", async (c, next) => {
    c.set("metrics", metrics);
    await next();
});
miscRoutes(app, config);

app.route("/", companionApp);

// This cannot be changed since companion restricts the
// files it can access using --allow-write argument in Deno (kept for compatibility)
const udsPath = config.server.unix_socket_path;

export function run(signal: AbortSignal, port: number, hostname: string) {
    let server: any;

    if (config.server.use_unix_socket) {
        try {
            if (existsSync(udsPath)) {
                // Delete the unix domain socket manually before starting the server
                unlinkSync(udsPath);
            }
        } catch (err) {
            console.log(
                `[ERROR] Failed to delete unix domain socket '${udsPath}' before starting the server:`,
                err,
            );
        }

        server = createAdaptorServer(app);
        server.listen(udsPath, () => {
            try {
                chmodSync(udsPath, 0o777);
            } catch (err) {
                console.log(`[ERROR] Failed to set permissions 777 on '${udsPath}':`, err);
            }
            console.log(
                `[INFO] Server successfully started at ${udsPath} with permissions set to 777.`,
            );
        });
    } else {
        server = serve(
            {
                port: port,
                hostname: hostname,
                fetch: app.fetch,
            },
            () => {
                console.log(
                    `[INFO] Server successfully started at http://${config.server.host}:${config.server.port}${config.server.base_path}`,
                );
            },
        );
    }

    if (signal) {
        signal.addEventListener("abort", () => {
            console.log("Abort signal received, closing server...");
            server.close();
        });
    }

    return server;
}

const isMainModule = process.argv[1] && (
    process.argv[1].endsWith("main.ts") || 
    process.argv[1].endsWith("main.js") ||
    process.argv[1].endsWith("main.tsx")
);

if (isMainModule) {
    const controller = new AbortController();
    const { signal } = controller;
    run(signal, config.server.port, config.server.host);

    if (process.platform !== "win32") {
        process.on("SIGTERM", () => {
            console.log("Caught SIGTERM, shutting down...");
            controller.abort();
            process.exit(0);
        });
    }

    process.on("SIGINT", () => {
        console.log("Caught SIGINT, shutting down...");
        controller.abort();
        process.exit(0);
    });
}
