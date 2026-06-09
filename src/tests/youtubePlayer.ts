import assert from "node:assert/strict";

export async function youtubePlayer(
    baseUrl: string,
    headers: { Authorization: string },
) {
    const resp = await fetch(`${baseUrl}/youtubei/v1/player`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            videoId: "jNQXAC9IVRw",
        }),
    });

    assert.equal(resp.status, 200, "response status code is not 200");

    const youtubeV1Player = await resp.json();

    assert.equal(
        youtubeV1Player.playabilityStatus?.status,
        "OK",
        "playabilityStatus is not OK",
    );
    assert.equal(
        youtubeV1Player.videoDetails?.videoId,
        "jNQXAC9IVRw",
        "videoDetails is not jNQXAC9IVRw",
    );
    assert.ok(
        youtubeV1Player.streamingData?.adaptiveFormats,
        "adaptiveFormats is not present",
    );
    assert.ok(
        youtubeV1Player.streamingData?.adaptiveFormats.length > 0,
        "adaptiveFormats is empty",
    );
}
