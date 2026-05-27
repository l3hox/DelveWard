#!/usr/bin/env node
// planning/m4.5/scripts/smoke.mjs
//
// Headless Playwright smoke driver for the M4.5 autonomous run.
// Boots the Vite dev server, loads a fixture level, drives scripted input,
// asserts zero console.error/warn and a stable frame budget.
//
// Pre-flight requirements (not yet wired):
//   1. devDependency: @playwright/test
//   2. src/main.ts must set `window.__delveward_ready = true` after the first
//      frame renders, and expose `window.__delveward` with a small input/save API.
//   3. A fixture level checked in at public/levels/m4.5-smoke.json.
//
// Until those land, this script exits 2 with a descriptive message so the
// pre-flight checklist surfaces them clearly.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const WRITE_GOLDENS = process.argv.includes("--write-goldens");

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const FIXTURE = "fixture1";
const GOLDEN_DIR = resolve(__dirname, "..", "goldens");
const LEVEL_INIT_GOLDEN = resolve(GOLDEN_DIR, "level-init.json");
const SAVE_FIXTURE_GOLDEN = resolve(GOLDEN_DIR, "save-fixture.json");

function preflightFail(msg) {
    process.stderr.write(`smoke: ${msg}\n`);
    process.exit(2);
}

// Fields that vary between runs but are not behaviorally meaningful.
// Stripped from goldens so byte-equal comparison is stable.
const VOLATILE_KEYS = new Set([
    "timestamp",   // SaveData.timestamp is wall-clock at save
    "now",         // SignalManager.now is a monotonic clock; drifts by frame timing
]);

function redact(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(redact);
    const result = {};
    for (const [k, v] of Object.entries(value)) {
        if (VOLATILE_KEYS.has(k)) continue;
        result[k] = redact(v);
    }
    return result;
}

function serializeGolden(value) {
    return JSON.stringify(redact(value), null, 2) + "\n";
}

async function checkGolden(path, value, issues) {
    const serialized = serializeGolden(value);
    if (WRITE_GOLDENS) {
        mkdirSync(dirname(path), { recursive: true });
        await writeFile(path, serialized);
        process.stdout.write(`smoke: wrote ${path}\n`);
        return;
    }
    if (!existsSync(path)) {
        issues.push(`golden missing: ${path} (run with --write-goldens to create)`);
        return;
    }
    const expected = await readFile(path, "utf8");
    if (expected !== serialized) {
        issues.push(`golden mismatch: ${path}`);
    }
}

const fixturePath = resolve(REPO_ROOT, "public/levels", `${FIXTURE}.json`);
if (!existsSync(fixturePath)) {
    preflightFail(`fixture not found: ${fixturePath} (create it during pre-flight build-out)`);
}

let playwright;
try {
    playwright = await import("playwright");
} catch {
    preflightFail("playwright not installed (run: npm install -D playwright)");
}

const PORT = 5180;
const URL = `http://localhost:${PORT}/?level=${FIXTURE}&devsmoke=1`;
const SMOKE_TIMEOUT_MS = 60_000;
const FRAME_BUDGET_P95_MS = 25;
const CONSOLE_ALLOWLIST = [
    // Headless Chromium GPU driver noise. Not a code defect; surfaces only
    // in headless WebGL contexts and is irrelevant to the game's behavior.
    /GL Driver Message.*ReadPixels/,
    // Three.js logs this when running in a context without async shader
    // compilation. Browser-capability difference, not a regression.
    /KHR_parallel_shader_compile extension not supported/,
];

let server, browser;
const cleanup = async () => {
    try { if (browser) await browser.close(); } catch {}
    try { if (server && !server.killed) server.kill("SIGTERM"); } catch {}
};

process.on("SIGINT", () => cleanup().then(() => process.exit(130)));
process.on("SIGTERM", () => cleanup().then(() => process.exit(143)));

function startDevServer() {
    return new Promise((resolveServer, rejectServer) => {
        const proc = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
            cwd: REPO_ROOT,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let ready = false;
        const onLine = (chunk) => {
            const s = chunk.toString();
            if (!ready && /Local:\s+http:/i.test(s)) {
                ready = true;
                resolveServer(proc);
            }
        };
        proc.stdout.on("data", onLine);
        proc.stderr.on("data", onLine);
        proc.on("exit", (code) => { if (!ready) rejectServer(new Error(`vite exited early: ${code}`)); });
        setTimeout(() => { if (!ready) rejectServer(new Error("vite did not become ready in 20s")); }, 20_000);
    });
}

async function runSmoke() {
    server = await startDevServer();
    browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const errors = [];
    const warnings = [];
    page.on("console", (msg) => {
        const text = msg.text();
        if (CONSOLE_ALLOWLIST.some((rx) => rx.test(text))) return;
        if (msg.type() === "error") errors.push(text);
        if (msg.type() === "warning") warnings.push(text);
    });
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: SMOKE_TIMEOUT_MS });
    await page.waitForFunction("window.__delveward_ready === true", null, { timeout: SMOKE_TIMEOUT_MS });

    const levelInit = await page.evaluate(() => /** @type any */ (window).__delveward.getLevelState());
    const goldenIssues = [];
    await checkGolden(LEVEL_INIT_GOLDEN, levelInit, goldenIssues);

    // Scripted input. Mirrors the save-fixture golden's recorded sequence.
    await page.evaluate(async () => {
        const dw = /** @type any */ (window).__delveward;
        if (!dw || typeof dw.input !== "function") {
            throw new Error("window.__delveward.input not available");
        }
        const seq = ["forward","forward","forward","forward","forward","forward","turnLeft","strafeRight","strafeRight","strafeRight","toggleInventory","toggleInventory","saveSlot1","loadSlot1"];
        for (const k of seq) {
            dw.input(k);
            await new Promise((r) => setTimeout(r, 80));
        }
    });

    const saveData = await page.evaluate(() => /** @type any */ (window).__delveward.getSaveData());
    await checkGolden(SAVE_FIXTURE_GOLDEN, saveData, goldenIssues);

    // Crude frame-budget sample: read the average since boot, if exposed.
    const frame = await page.evaluate(() => /** @type any */ (window).__delveward?.frameStats?.() ?? null);
    const p95 = frame?.p95Ms ?? null;

    await cleanup();

    if (goldenIssues.length) {
        for (const issue of goldenIssues) process.stderr.write(`smoke: ${issue}\n`);
        process.exit(1);
    }

    if (errors.length || warnings.length) {
        process.stderr.write(`smoke: console errors=${errors.length} warnings=${warnings.length}\n`);
        for (const e of errors) process.stderr.write(`  ERR: ${e}\n`);
        for (const w of warnings) process.stderr.write(`  WARN: ${w}\n`);
        process.exit(1);
    }
    if (p95 !== null && p95 > FRAME_BUDGET_P95_MS) {
        process.stderr.write(`smoke: frame p95 ${p95}ms exceeds budget ${FRAME_BUDGET_P95_MS}ms\n`);
        process.exit(1);
    }
    process.stdout.write(`smoke: ok (errors=0 warnings=0 p95=${p95 ?? "n/a"}ms)\n`);
}

try {
    await runSmoke();
    process.exit(0);
} catch (err) {
    await cleanup();
    process.stderr.write(`smoke: ${err?.message || err}\n`);
    process.exit(1);
}
