import { Innertube } from "youtubei.js";
import type { CaptionTrackData } from "youtubei.js/dist/src/parser/classes/PlayerCaptionsTracklist.js";
import { HTTPException } from "hono/http-exception";

function formatMsToDigital(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    const msStr = String(milliseconds).padStart(3, "0");
    const secStr = String(seconds).padStart(2, "0");
    const minStr = String(minutes).padStart(2, "0");

    if (hours > 0) {
        const hrStr = String(hours).padStart(2, "0");
        return `${hrStr}:${minStr}:${secStr}.${msStr}`;
    }
    return `${minStr}:${secStr}.${msStr}`;
}

const ESCAPE_SUBSTITUTIONS = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\u200E": "&lrm;",
    "\u200F": "&rlm;",
    "\u00A0": "&nbsp;",
};

export async function handleTranscripts(
    innertubeClient: Innertube,
    videoId: string,
    selectedCaption: CaptionTrackData,
) {
    const lines: string[] = ["WEBVTT"];

    const info = await innertubeClient.getInfo(videoId);
    const transcriptInfo = await (await info.getTranscript()).selectLanguage(
        selectedCaption.name.text || "",
    );
    const rawTranscriptLines = transcriptInfo.transcript.content?.body
        ?.initial_segments;

    if (rawTranscriptLines == undefined) throw new HTTPException(404);

    rawTranscriptLines.forEach((line) => {
        const start_ms = formatMsToDigital(Number(line.start_ms));
        const end_ms = formatMsToDigital(Number(line.end_ms));
        const timestamp = `${start_ms} --> ${end_ms}`;

        const text = (line.snippet?.text || "").replace(
            /[&<>‍‍\u200E\u200F\u00A0]/g,
            (match: string) =>
                ESCAPE_SUBSTITUTIONS[
                    match as keyof typeof ESCAPE_SUBSTITUTIONS
                ],
        );

        lines.push(`${timestamp}\n${text}`);
    });

    return lines.join("\n\n");
}
