import assert from "node:assert/strict";

export async function latestVersion(baseUrl: string) {
    const resp = await fetch(
        `${baseUrl}/latest_version?id=jNQXAC9IVRw&itag=18&local=true`,
        {
            method: "GET",
            redirect: "manual",
        },
    );

    await resp.body?.cancel();
    assert.equal(resp.status, 302);
}
