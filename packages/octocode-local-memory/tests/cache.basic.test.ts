import { describe, it, expect, beforeEach } from 'vitest';
import NodeCache from 'node-cache';

describe('Cache Basic Operations', () => {
  let cache: NodeCache;

  beforeEach(() => {
    cache = new NodeCache({
      stdTTL: 3600,
      checkperiod: 120,
      useClones: false,
    });
  });

  it('should initialize cache with correct configuration', () => {
    expect(cache).toBeDefined();
  });

  it('should set and get a value', () => {
    cache.set('test:key', 'test value');
    const value = cache.get('test:key');
    expect(value).toBe('test value');
  });

  it('should return undefined for non-existent key', () => {
    const value = cache.get('nonexistent:key');
    expect(value).toBeUndefined();
  });

  it('should handle JSON stringified objects', () => {
    const taskData = {
      taskId: '3.1',
      agentId: 'agent-implementation-1',
      description: 'Implement user authentication',
      files: ['src/auth/auth.ts'],
    };
    cache.set('task:3.1', JSON.stringify(taskData));
    const retrieved = JSON.parse(cache.get('task:3.1') as string);
    expect(retrieved).toEqual(taskData);
  });

  it('should respect TTL expiration', async () => {
    cache.set('test:ttl', 'expires soon', 1);
    expect(cache.get('test:ttl')).toBe('expires soon');

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(cache.get('test:ttl')).toBeUndefined();
  });

  it('should handle multiple keys independently', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
  });

  it('should overwrite existing keys', () => {
    cache.set('test:key', 'original');
    expect(cache.get('test:key')).toBe('original');

    cache.set('test:key', 'updated');
    expect(cache.get('test:key')).toBe('updated');
  });

  it('should handle empty string values', () => {
    cache.set('empty:key', '');
    expect(cache.get('empty:key')).toBe('');
  });

  it('should handle large values', () => {
    const largeValue = 'x'.repeat(1000000); // 1MB of data
    cache.set('large:key', largeValue);
    expect(cache.get('large:key')).toBe(largeValue);
  });

  it('should support parallel operations', () => {
    const keys: string[] = [];
    for (let i = 0; i < 100; i++) {
      const key = `parallel:key:${i}`;
      cache.set(key, `value-${i}`);
      keys.push(key);
    }

    keys.forEach((key, i) => {
      expect(cache.get(key)).toBe(`value-${i}`);
    });
  });

  describe('Delete Operations', () => {
    it('should delete an existing key', () => {
      cache.set('test:delete', 'value to delete');
      expect(cache.get('test:delete')).toBe('value to delete');

      const deleted = cache.del('test:delete');
      expect(deleted).toBe(1);
      expect(cache.get('test:delete')).toBeUndefined();
    });

    it('should return 0 when deleting non-existent key', () => {
      const deleted = cache.del('nonexistent:key');
      expect(deleted).toBe(0);
    });

    it('should delete multiple keys independently', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const deleted1 = cache.del('key1');
      expect(deleted1).toBe(1);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');

      const deleted2 = cache.del('key3');
      expect(deleted2).toBe(1);
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBeUndefined();
    });

    it('should allow re-setting a deleted key', () => {
      cache.set('test:reuse', 'original');
      cache.del('test:reuse');
      expect(cache.get('test:reuse')).toBeUndefined();

      cache.set('test:reuse', 'new value');
      expect(cache.get('test:reuse')).toBe('new value');
    });

    it('should delete lock pattern keys', () => {
      cache.set('lock:src/auth/login.ts', JSON.stringify({ agent: 'impl-1' }));
      expect(cache.get('lock:src/auth/login.ts')).toBeDefined();

      cache.del('lock:src/auth/login.ts');
      expect(cache.get('lock:src/auth/login.ts')).toBeUndefined();
    });

    it('should delete task assignment keys', () => {
      const task = {
        taskId: '1',
        assignedTo: 'agent-impl-1',
        description: 'Test task',
      };
      cache.set('task:1', JSON.stringify(task));
      expect(cache.get('task:1')).toBeDefined();

      cache.del('task:1');
      expect(cache.get('task:1')).toBeUndefined();
    });

    it('should delete status keys', () => {
      const status = { status: 'in_progress', progress: 50 };
      cache.set('status:agent-1:task-1', JSON.stringify(status));
      expect(cache.get('status:agent-1:task-1')).toBeDefined();

      cache.del('status:agent-1:task-1');
      expect(cache.get('status:agent-1:task-1')).toBeUndefined();
    });

    it('should handle deleting same key multiple times', () => {
      cache.set('test:multiple-delete', 'value');
      const deleted1 = cache.del('test:multiple-delete');
      expect(deleted1).toBe(1);

      const deleted2 = cache.del('test:multiple-delete');
      expect(deleted2).toBe(0);

      const deleted3 = cache.del('test:multiple-delete');
      expect(deleted3).toBe(0);
    });
  });
});
