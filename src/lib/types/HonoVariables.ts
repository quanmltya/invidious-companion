import { Innertube } from "youtubei.js";
import type { TokenMinter } from "../jobs/potoken.js";
import type { Config } from "../helpers/config.js";
import { Metrics } from "../helpers/metrics.js";

export type HonoVariables = {
    innertubeClient: Innertube;
    config: Config;
    tokenMinter: TokenMinter | undefined;
    metrics: Metrics | undefined;
};
