import { Worker } from "node:worker_threads";
import { Innertube } from "youtubei.js";
import {
    youtubePlayerParsing,
    youtubeVideoInfo,
} from "../helpers/youtubePlayerHandling.js";
import type { Config } from "../helpers/config.js";
import { Metrics } from "../helpers/metrics.js";

let getFetchClientLocation = "../helpers/getFetchClient.js";
if (process.env.GET_FETCH_CLIENT_LOCATION) {
    getFetchClientLocation = process.env.GET_FETCH_CLIENT_LOCATION;
}
const { getFetchClient } = await import(getFetchClientLocation);

import { InputMessage, OutputMessageSchema } from "./worker.js";
import { PLAYER_ID } from "../../constants.js";

// Polyfill Promise.withResolvers for older Node.js versions
function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

interface TokenGeneratorWorker extends Omit<Worker, "postMessage"> {
    postMessage(message: InputMessage): void;
}

const workers: TokenGeneratorWorker[] = [];

function createMinter(worker: TokenGeneratorWorker) {
    return (videoId: string): Promise<string> => {
        const { promise, resolve } = withResolvers<string>();
        // generate a UUID to identify the request as many minter calls
        // may be made within a timespan, and this function will be
        // informed about all of them until it's got its own
        const requestId = crypto.randomUUID();
        const listener = (data: any) => {
            const parsedMessage = OutputMessageSchema.parse(data);
            if (
                parsedMessage.type === "content-token" &&
                parsedMessage.requestId === requestId
            ) {
                worker.off("message", listener);
                resolve(parsedMessage.contentToken);
            }
        };
        worker.on("message", listener);
        worker.postMessage({
            type: "content-token-request",
            videoId,
            requestId,
        });

        return promise;
    };
}

export type TokenMinter = ReturnType<typeof createMinter>;

// Adapted from https://github.com/LuanRT/BgUtils/blob/main/examples/node/index.ts
export const poTokenGenerate = (
    config: Config,
    metrics: Metrics | undefined,
): Promise<{ innertubeClient: Innertube; tokenMinter: TokenMinter }> => {
    const { promise, resolve, reject } = withResolvers<
        Awaited<ReturnType<typeof poTokenGenerate>>
    >();

    const worker = new Worker(
        new URL("./worker.js", import.meta.url),
    ) as unknown as TokenGeneratorWorker;
    
    // take note of the worker so we can kill it once a new one takes its place
    workers.push(worker);
    
    worker.on("message", async (data) => {
        const parsedMessage = OutputMessageSchema.parse(data);

        // worker is listening for messages
        if (parsedMessage.type === "ready") {
            const untypedPostMessage = worker.postMessage.bind(worker);
            worker.postMessage = (message: InputMessage) =>
                untypedPostMessage(message);
            worker.postMessage({ type: "initialise", config });
        }

        if (parsedMessage.type === "error") {
            console.log({ errorFromWorker: parsedMessage.error });
            worker.terminate();
            reject(parsedMessage.error);
        }

        // worker is initialised and has passed back a session token and visitor data
        if (parsedMessage.type === "initialised") {
            try {
                const fetchImpl = await getFetchClient(config);

                const instantiatedInnertubeClient = await Innertube.create({
                    enable_session_cache: false,
                    po_token: parsedMessage.sessionPoToken,
                    visitor_data: parsedMessage.visitorData,
                    fetch: fetchImpl,
                    generate_session_locally: true,
                    cookie: config.youtube_session.cookies || undefined,
                    player_id: PLAYER_ID,
                });
                const minter = createMinter(worker);
                // check token from minter
                await checkToken({
                    instantiatedInnertubeClient,
                    config,
                    integrityTokenBasedMinter: minter,
                    metrics,
                });
                console.log("[INFO] Successfully generated PO token");
                const numberToKill = workers.length - 1;
                for (let i = 0; i < numberToKill; i++) {
                    const workerToKill = workers.shift();
                    workerToKill?.terminate();
                }
                return resolve({
                    innertubeClient: instantiatedInnertubeClient,
                    tokenMinter: minter,
                });
            } catch (err) {
                console.log("[WARN] Failed to get valid PO token, will retry", {
                    err,
                });
                worker.terminate();
                reject(err);
            }
        }
    });

    worker.on("error", (err) => {
        console.error("[ERROR] Worker thread error:", err);
        reject(err);
    });

    return promise;
};

async function checkToken({
    instantiatedInnertubeClient,
    config,
    integrityTokenBasedMinter,
    metrics,
}: {
    instantiatedInnertubeClient: Innertube;
    config: Config;
    integrityTokenBasedMinter: TokenMinter;
    metrics: Metrics | undefined;
}) {
    const fetchImpl = getFetchClient(config);

    try {
        console.log("[INFO] Searching for videos to validate PO token");
        const searchResults = await instantiatedInnertubeClient.search("news", {
            type: "video",
            upload_date: "week",
            duration: "three_to_twenty_mins",
        });

        // Get all videos that have an id property and shuffle them randomly
        const videos = searchResults.videos
            .filter((video) =>
                video.type === "Video" && "id" in video && video.id
            )
            .map((value) => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value);

        if (videos.length === 0) {
            throw new Error("No videos with valid IDs found in search results");
        }

        // Try up to 3 random videos to validate the token
        const maxAttempts = Math.min(3, videos.length);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const video = videos[attempt];

            try {
                // Type guard to ensure video has an id property
                if (!("id" in video) || !video.id) {
                    console.log(
                        `[WARN] Video at index ${attempt} has no valid ID, trying next video`,
                    );
                    continue;
                }

                console.log(
                    `[INFO] Validating PO token with video: ${video.id}`,
                );

                // console.log("PO token:", instantiatedInnertubeClient.session.po_token);

                const youtubePlayerResponseJson = await youtubePlayerParsing({
                    innertubeClient: instantiatedInnertubeClient,
                    videoId: video.id,
                    config,
                    tokenMinter: integrityTokenBasedMinter,
                    metrics,
                    overrideCache: true,
                });

                const videoInfo = youtubeVideoInfo(
                    instantiatedInnertubeClient,
                    youtubePlayerResponseJson,
                );

                const validFormat = videoInfo.streaming_data
                    ?.adaptive_formats[0];
                // console.log("Format URL:", validFormat?.url?.substring(0, 300));
                if (!validFormat) {
                    console.log(
                        `[WARN] No valid format found for video ${video.id}, trying next video`,
                    );
                    continue;
                }

                console.log("Validation URL:", validFormat.url);
                const result = await fetchImpl(validFormat.url, {
                    method: "GET",
                    headers: {
                        Range: "bytes=0-0",
                    },
                });

                /*console.log({
                    status: result.status,
                    statusText: result.statusText,
                });*/
                const validStatuses = [200, 206];

                if (!validStatuses.includes(result.status)) {
                    const body = await result.text().catch(() => "");

                    /*console.log({
                        status: result.status,
                        statusText: result.statusText,
                        body: body.substring(0, 500),
                    });*/

                    continue;
                } else {
                    console.log(
                        `[INFO] Successfully validated PO token with video: ${video.id}`,
                    );
                    return; // Success
                }
            } catch (err) {
                const videoId = ("id" in video && video.id)
                    ? video.id
                    : "unknown";
                console.log(
                    `[WARN] Failed to validate with video ${videoId}:`,
                    { err },
                );
                if (attempt === maxAttempts - 1) {
                    throw new Error(
                        "Failed to validate PO token with any available videos",
                    );
                }
                continue;
            }
        }
        // If we reach here, all attempts failed without throwing an exception
        throw new Error(
            "Failed to validate PO token: all validation attempts returned non-200 status codes",
        );
    } catch (err) {
        console.log("Failed to validate PO token using search method", { err });
        throw err;
    }
}
