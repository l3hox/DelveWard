// src/main.dev-smoke.ts
//
// DEV-only smoke API. Exposes window.__delveward + window.__delveward_ready
// for headless drivers (Playwright). Imported only under
// `if (import.meta.env.DEV)` in main.ts; Vite tree-shakes this entire
// module out of production builds.

export interface SmokeApiDeps {
    moveForward(): void;
    moveBack(): void;
    turnLeft(): void;
    turnRight(): void;
    strafeLeft(): void;
    strafeRight(): void;
    toggleInventory(): void;
    saveSlot(slotIndex: number): void;
    loadSlot(slotIndex: number): void;
    getSaveData(): unknown;
    getLevelState(): unknown;
}

export interface FrameStatsSnapshot {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    samples: number;
}

const FRAME_BUFFER_SIZE = 600;
const frameDeltasMs: number[] = [];
let firstFrameMarked = false;
let firstFrameAtMs = 0;

function percentile(sorted: readonly number[], fraction: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
    return sorted[idx];
}

export function installSmokeApi(deps: SmokeApiDeps): void {
    const api = {
        input(name: string): void {
            switch (name) {
                case "forward": deps.moveForward(); break;
                case "backward": deps.moveBack(); break;
                case "turnLeft": deps.turnLeft(); break;
                case "turnRight": deps.turnRight(); break;
                case "strafeLeft": deps.strafeLeft(); break;
                case "strafeRight": deps.strafeRight(); break;
                case "toggleInventory": deps.toggleInventory(); break;
                case "saveSlot1": deps.saveSlot(0); break;
                case "loadSlot1": deps.loadSlot(0); break;
                default:
                    throw new Error(`__delveward.input: unknown name "${name}"`);
            }
        },
        frameStats(): FrameStatsSnapshot {
            const sorted = [...frameDeltasMs].sort((a, b) => a - b);
            return {
                p50Ms: percentile(sorted, 0.5),
                p95Ms: percentile(sorted, 0.95),
                p99Ms: percentile(sorted, 0.99),
                samples: sorted.length,
            };
        },
        firstFrameAtMs(): number {
            return firstFrameAtMs;
        },
        getSaveData(): unknown {
            return deps.getSaveData();
        },
        getLevelState(): unknown {
            return deps.getLevelState();
        },
    };
    (window as unknown as { __delveward: typeof api }).__delveward = api;
}

export function smokeFrameTick(deltaSeconds: number): void {
    frameDeltasMs.push(deltaSeconds * 1000);
    if (frameDeltasMs.length > FRAME_BUFFER_SIZE) frameDeltasMs.shift();
    if (!firstFrameMarked) {
        firstFrameMarked = true;
        firstFrameAtMs = performance.now();
        (window as unknown as { __delveward_ready: boolean }).__delveward_ready = true;
    }
}
