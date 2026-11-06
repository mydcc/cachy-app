#!/usr/bin/env node
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Regression test for download_ci_artifact in deploy.sh (BUG-0797).
//
// deploy.sh --ci downloads a fixed URL on a moving release tag, and the
// workflow replaces that tag by deleting and recreating the release. For a few
// seconds the URL returns 404 — a real deploy failure that fixes itself. The
// helper waits that window out and must keep failing fast on everything else.
//
// No CI job runs this: it is a local gate, like `npm run test:gpu`. It needs no
// dependencies, only bash, curl and node.
//
//   npm run test:deploy

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// DEPLOY_SCRIPT exists so the guard can be pointed at a modified copy — that is
// how the scenarios were shown to fail before the fix.
const DEPLOY = process.env.DEPLOY_SCRIPT
    ? resolve(process.env.DEPLOY_SCRIPT)
    : join(ROOT, "deploy.sh");
const PAYLOAD = Buffer.from("PAYLOAD-" + "x".repeat(4096));

const attempts = {};
const server = createServer((req, res) => {
    const scripted = req.url.match(/^\/(ok-after|flaky)\/(\d+)$/);
    if (req.url === "/always404") {
        res.writeHead(404).end("no");
        return;
    }
    if (req.url === "/forbidden") {
        res.writeHead(403).end("no");
        return;
    }
    if (scripted) {
        const [, kind, limit] = scripted;
        attempts[req.url] = (attempts[req.url] ?? 0) + 1;
        if (attempts[req.url] <= Number(limit)) {
            res.writeHead(kind === "flaky" ? 503 : 404).end("not yet");
            return;
        }
        res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(PAYLOAD);
        return;
    }
    res.writeHead(404).end();
});

function extractFunction() {
    const source = readFileSync(DEPLOY, "utf8").split("\n");
    const start = source.findIndex((line) => line.startsWith("download_ci_artifact() {"));
    if (start === -1) throw new Error(`download_ci_artifact not found in ${DEPLOY}`);
    const end = source.findIndex((line, index) => index > start && line === "}");
    if (end === -1) throw new Error("could not find the end of download_ci_artifact");
    return source.slice(start, end + 1).join("\n");
}

let passed = 0;
let failed = 0;

function check(label, ok) {
    if (ok) {
        passed += 1;
        process.stdout.write(`  PASS  ${label}\n`);
    } else {
        failed += 1;
        process.stdout.write(`  FAIL  ${label}\n`);
    }
}

function run(workDir, { url, out, target, env = {} }) {
    const runner = join(workDir, "runner.sh");
    writeFileSync(runner, `set -e\nsource "${join(workDir, "fn.sh")}"\ndownload_ci_artifact "${url}" "${out}" "${target}"\n`);
    const started = Date.now();
    // Async on purpose: a synchronous spawn would block this process's event
    // loop and the stub server could never answer the child's curl.
    return new Promise((done) => {
        const child = spawn("bash", [runner], {
            env: { ...process.env, CI_DOWNLOAD_DELAY: "1", ...env },
        });
        let output = "";
        const killTimer = setTimeout(() => child.kill("SIGKILL"), 30_000);
        child.stdout.on("data", (chunk) => (output += chunk));
        child.stderr.on("data", (chunk) => (output += chunk));
        child.on("close", (status) => {
            clearTimeout(killTimer);
            done({
                status,
                output,
                tookSeconds: Math.round((Date.now() - started) / 1000),
                outFileExists: existsSync(out),
                partFileExists: existsSync(`${out}.part`),
            });
        });
    });
}

async function main() {
    const workDir = mkdtempSync(join(tmpdir(), "artifact-download-"));
    writeFileSync(join(workDir, "fn.sh"), extractFunction());

    await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        // 1. The window itself: 404 twice, then the artifact.
        const a = await run(workDir, { url: `${base}/ok-after/2`, out: join(workDir, "a.tar.gz"), target: "deploy-beta" });
        check("404 twice, then 200 exits 0", a.status === 0);
        check("the artifact is the full payload", a.outFileExists && readFileSync(join(workDir, "a.tar.gz")).equals(PAYLOAD));
        check("no .part file survives a successful retry", !a.partFileExists);
        check("the retry is announced in the log", /HTTP 404/.test(a.output));

        // 2. A persistent 404 must still fail, inside the budget, and say which tag.
        const b = await run(workDir, {
            url: `${base}/always404`,
            out: join(workDir, "b.tar.gz"),
            target: "deploy-beta",
            env: { CI_DOWNLOAD_MAX_WAIT: "2" },
        });
        check("persistent 404 exits 1", b.status === 1);
        check("persistent 404 names the tag", /Tag: deploy-beta/.test(b.output));
        check("persistent 404 names the URL", b.output.includes(`URL: ${base}/always404`));
        check("persistent 404 reports the status", /Last attempt: HTTP 404/.test(b.output));
        check("persistent 404 points at a wrong tag", /CI_ARTIFACT_TAG/.test(b.output));
        check(`persistent 404 respects the budget (${b.tookSeconds}s)`, b.tookSeconds < 8);
        check("persistent 404 writes no artifact", !b.outFileExists && !b.partFileExists);

        // 3. A 403 is not the window and must not wait.
        const c = await run(workDir, {
            url: `${base}/forbidden`,
            out: join(workDir, "c.tar.gz"),
            target: "deploy-beta",
            env: { CI_DOWNLOAD_MAX_WAIT: "30" },
        });
        check("403 exits 1", c.status === 1);
        check(`403 fails without waiting (${c.tookSeconds}s)`, c.tookSeconds < 3);
        check("403 is not reported as the publish window", /not the publish window/.test(c.output));
        check("403 names the tag", c.output.includes("deploy-beta"));
        check("403 leaves no .part file", !c.partFileExists);

        // 4. A transient server error is retried like the window.
        const d = await run(workDir, { url: `${base}/flaky/2`, out: join(workDir, "d.tar.gz"), target: "deploy-beta" });
        check("503 twice, then 200 exits 0", d.status === 0 && d.outFileExists);
        check("the 503 is announced as retried", /HTTP 503/.test(d.output));

        // 5. A transport failure has no status code and is still transient.
        const refused = await run(workDir, {
            url: "http://127.0.0.1:1/x",
            out: join(workDir, "e.tar.gz"),
            target: "deploy-beta",
            env: { CI_DOWNLOAD_MAX_WAIT: "3" },
        });
        check("refused connection exits 1", refused.status === 1);
        check("refused connection is retried", /retrying in/.test(refused.output));
        check("refused connection reports the transport failure", /Last attempt: curl exit/.test(refused.output));
        check("refused connection does not blame the tag", !/CI_ARTIFACT_TAG/.test(refused.output));

        // 6. A delay longer than the budget must not collapse it to one attempt.
        const f = await run(workDir, {
            url: `${base}/always404`,
            out: join(workDir, "f.tar.gz"),
            target: "deploy-beta",
            env: { CI_DOWNLOAD_MAX_WAIT: "3", CI_DOWNLOAD_DELAY: "30" },
        });
        const made = Number(f.output.match(/and (\d+) attempts/)?.[1] ?? 0);
        check(`delay above the budget still retries (${made} attempts)`, made > 1);
    } finally {
        server.close();
        rmSync(workDir, { recursive: true, force: true });
    }

    process.stdout.write(`\nartifact download: ${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exit(1);
});
