import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- THREE.js mocks must be constructable classes ---

const mockCtx = {
  fillStyle: '' as string,
  fillRect: vi.fn(),
};

vi.stubGlobal('document', {
  createElement: (_tag: string) => ({
    width: 0,
    height: 0,
    getContext: () => mockCtx,
  }),
});

vi.mock('three', () => {
  class Group {
    add = vi.fn();
    remove = vi.fn();
  }

  class Sprite {
    position = { x: 0, y: 0, z: 0, set: vi.fn(function(this: { x: number; y: number; z: number }, x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }) };
    scale = { x: 0.6, y: 0.1, z: 1, set: vi.fn(function(this: { x: number; y: number; z: number }, x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }) };
    rotation = { y: 0 };
    visible = false;
  }

  class SpriteMaterial {
    map: { needsUpdate: boolean; dispose: () => void } = { needsUpdate: false, dispose: vi.fn() };
    dispose = vi.fn();
  }

  class CanvasTexture {
    needsUpdate = false;
    magFilter = 0;
    minFilter = 0;
    dispose = vi.fn();
  }

  return {
    Group,
    Sprite,
    SpriteMaterial,
    CanvasTexture,
    NearestFilter: 1006,
  };
});

// Import AFTER mocks are declared
const { EnemyHealthBarManager } = await import('./enemyHealthBar');

// --- Helpers ---

function makeMesh(x = 0, y = 1, z = 0) {
  return {
    position: { x, y, z },
  } as unknown as import('three').Mesh;
}

function makeCamera(rotationY = 0) {
  return {
    rotation: { y: rotationY },
  } as unknown as import('three').Camera;
}

// ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EnemyHealthBarManager', () => {
  describe('create', () => {
    it('stores a new entry in the entries map', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('2,2', makeMesh(2, 1, 4), 10, 2.0);
      expect(mgr.entries.has('2,2')).toBe(true);
    });

    it('initialises lastHp and lastMaxHp to maxHp', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('1,1', makeMesh(), 20, 1.2);
      const entry = mgr.entries.get('1,1')!;
      expect(entry.lastHp).toBe(20);
      expect(entry.lastMaxHp).toBe(20);
    });

    it('starts the sprite hidden (full HP on creation)', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('0,0', makeMesh(), 5, 1.2);
      const entry = mgr.entries.get('0,0')!;
      expect(entry.sprite.visible).toBe(false);
    });

    it('stores spriteHeight in the entry', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('1,0', makeMesh(), 10, 2.0);
      const entry = mgr.entries.get('1,0')!;
      expect(entry.spriteHeight).toBe(2.0);
    });
  });

  describe('update', () => {
    it('shows sprite when hp drops below maxHp', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('1,0', makeMesh(), 10, 1.2);

      mgr.update('1,0', 7, 10);

      const entry = mgr.entries.get('1,0')!;
      expect(entry.sprite.visible).toBe(true);
    });

    it('hides sprite when hp is restored to maxHp', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('1,0', makeMesh(), 10, 1.2);

      mgr.update('1,0', 7, 10);
      mgr.update('1,0', 10, 10);

      const entry = mgr.entries.get('1,0')!;
      expect(entry.sprite.visible).toBe(false);
    });

    it('skips re-render when hp and maxHp have not changed', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('2,0', makeMesh(), 10, 1.2);

      mgr.update('2,0', 7, 10);
      const callsBefore = (mockCtx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length;

      mgr.update('2,0', 7, 10); // identical values — should be skipped
      const callsAfter = (mockCtx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(callsAfter).toBe(callsBefore);
    });

    it('updates lastHp and lastMaxHp after a change', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('3,0', makeMesh(), 12, 1.2);

      mgr.update('3,0', 4, 12);

      const entry = mgr.entries.get('3,0')!;
      expect(entry.lastHp).toBe(4);
      expect(entry.lastMaxHp).toBe(12);
    });

    it('is a no-op for an unknown key', () => {
      const mgr = new EnemyHealthBarManager();
      expect(() => mgr.update('99,99', 5, 10)).not.toThrow();
    });
  });

  describe('rekey', () => {
    it('moves entry from old key to new key', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('1,1', makeMesh(), 10, 1.2);

      mgr.rekey('1,1', '2,1');

      expect(mgr.entries.has('1,1')).toBe(false);
      expect(mgr.entries.has('2,1')).toBe(true);
    });

    it('is a no-op for an unknown key', () => {
      const mgr = new EnemyHealthBarManager();
      expect(() => mgr.rekey('99,99', '1,1')).not.toThrow();
    });
  });

  describe('remove', () => {
    it('deletes the entry from the entries map', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('5,5', makeMesh(), 8, 1.2);

      mgr.remove('5,5');

      expect(mgr.entries.has('5,5')).toBe(false);
    });

    it('is a no-op for an unknown key', () => {
      const mgr = new EnemyHealthBarManager();
      expect(() => mgr.remove('99,99')).not.toThrow();
    });
  });

  describe('updatePositions', () => {
    it('syncs bar Y to spriteHeight + BAR_Y_OFFSET', () => {
      const mgr = new EnemyHealthBarManager();
      const spriteHeight = 2.0;
      mgr.create('4,3', makeMesh(4, 1, 6), 10, spriteHeight);

      const movedMesh = makeMesh(5, 1, 7);
      mgr.updatePositions(new Map([['4,3', movedMesh]]));

      const entry = mgr.entries.get('4,3')!;
      const expectedY = spriteHeight + 0.12; // BAR_Y_OFFSET = 0.12
      const setFn = entry.sprite.position.set as ReturnType<typeof vi.fn>;
      const lastCall = setFn.mock.calls[setFn.mock.calls.length - 1] as [number, number, number];
      expect(lastCall[0]).toBe(5);
      expect(lastCall[1]).toBeCloseTo(expectedY, 5);
      expect(lastCall[2]).toBe(7);
    });

    it('does not throw when mesh is missing from meshMap', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('0,1', makeMesh(), 5, 1.2);
      expect(() => mgr.updatePositions(new Map())).not.toThrow();
    });
  });

  describe('updateBillboards', () => {
    it('sets sprite rotation.y to camera.rotation.y for each entry', () => {
      const mgr = new EnemyHealthBarManager();
      mgr.create('1,2', makeMesh(), 10, 1.2);
      mgr.create('3,4', makeMesh(), 10, 1.2);

      mgr.updateBillboards(makeCamera(1.57));

      for (const entry of mgr.entries.values()) {
        expect(entry.sprite.rotation.y).toBe(1.57);
      }
    });
  });
});
