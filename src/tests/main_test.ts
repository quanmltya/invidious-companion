import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.SERVER_SECRET_KEY = "aaaaaaaaaaaaaaaa";
const { run, tokenMinterReady } = await import("../main.js");

const { parseConfig } = await import("../lib/helpers/config.js");
const config = await parseConfig();

import { dashManifest } from "./dashManifest.js";
import { youtubePlayer } from "./youtubePlayer.js";
import { latestVersion } from "./latestVersion.js";

describe("Checking if Invidious companion works", () => {
    const controller = new AbortController();
    const baseUrl = `http://${config.server.host}:${config.server.port.toString()}${config.server.base_path}`;
    const headers = { Authorization: "Bearer aaaaaaaaaaaaaaaa" };

    before(async () => {
        run(controller.signal, config.server.port, config.server.host);
        // Wait for tokenMinter to be ready before running tests
        await tokenMinterReady;
    });

    after(() => {
        controller.abort();
    });

    it("Check if it can get an OK playabilityStatus on /youtubei/v1/player", async () => {
        await youtubePlayer(baseUrl, headers);
    });

    it("Check if it can generate a DASH manifest", async () => {
        await dashManifest(baseUrl);
    });

    it("Check if it can generate a valid URL for latest_version", async () => {
        await latestVersion(baseUrl);
    });
});
