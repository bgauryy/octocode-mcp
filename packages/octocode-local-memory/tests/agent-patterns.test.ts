import { describe, it, expect, beforeEach } from 'vitest';
import NodeCache from 'node-cache';

describe('Agent Communication Patterns', () => {
  let cache: NodeCache;

  beforeEach(() => {
    cache = new NodeCache({
      stdTTL: 3600,
      checkperiod: 120,
      useClones: false,
    });
  });

  describe('Task Assignment Pattern', () => {
    it('should store and retrieve task assignments', () => {
      const taskData = {
        taskId: '3.1',
        agentId: 'agent-implementation-1',
        description: 'Implement user authentication',
        files: ['src/auth/auth.ts', 'src/types/user.ts'],
        complexity: 'medium',
        assignedAt: '2025-10-15T14:30:00Z',
      };

      cache.set('task:3.1', JSON.stringify(taskData));

      const retrieved = JSON.parse(cache.get('task:3.1') as string);
      expect(retrieved).toEqual(taskData);
      expect(retrieved.taskId).toBe('3.1');
      expect(retrieved.files).toHaveLength(2);
    });

    it('should handle multiple task assignments', () => {
      const tasks = [
        { taskId: '3.1', description: 'Task 1' },
        { taskId: '3.2', description: 'Task 2' },
        { taskId: '3.3', description: 'Task 3' },
      ];

      tasks.forEach((task) => {
        cache.set(`task:${task.taskId}`, JSON.stringify(task));
      });

      tasks.forEach((task) => {
        const retrieved = JSON.parse(
          cache.get(`task:${task.taskId}`) as string
        );
        expect(retrieved.taskId).toBe(task.taskId);
      });
    });
  });

  describe('File Lock Pattern', () => {
    it('should implement lock acquisition', () => {
      const lockKey = 'lock:src/auth/auth.ts';
      const lockData = {
        lockedBy: 'agent-implementation-1',
        taskId: '3.1',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 300000, // 5 minutes
      };

      // Check lock doesn't exist
      expect(cache.get(lockKey)).toBeUndefined();

      // Acquire lock
      cache.set(lockKey, JSON.stringify(lockData), 300);

      // Verify lock exists
      const retrievedLock = JSON.parse(cache.get(lockKey) as string);
      expect(retrievedLock.lockedBy).toBe('agent-implementation-1');
      expect(retrievedLock.taskId).toBe('3.1');
    });

    it('should handle multiple file locks', () => {
      const files = [
        'src/auth/auth.ts',
        'src/api/routes.ts',
        'src/types/user.ts',
      ];

      files.forEach((file, index) => {
        const lockKey = `lock:${file}`;
        const lockData = {
          lockedBy: `agent-implementation-${index + 1}`,
          acquiredAt: Date.now(),
        };
        cache.set(lockKey, JSON.stringify(lockData), 300);
      });

      files.forEach((file, index) => {
        const lockKey = `lock:${file}`;
        const lock = JSON.parse(cache.get(lockKey) as string);
        expect(lock.lockedBy).toBe(`agent-implementation-${index + 1}`);
      });
    });

    it('should release locks by setting short TTL', () => {
      const lockKey = 'lock:src/auth/auth.ts';
      cache.set(lockKey, JSON.stringify({ lockedBy: 'agent-1' }), 300);

      // Verify lock exists
      expect(cache.get(lockKey)).toBeDefined();

      // Release lock (set with short TTL)
      cache.set(lockKey, JSON.stringify({ released: true }), 1);

      // Lock still exists briefly
      expect(cache.get(lockKey)).toBeDefined();
    });
  });

  describe('Status Update Pattern', () => {
    it('should store and retrieve agent status', () => {
      const statusKey = 'status:agent-implementation-1:3.1';
      const statusData = {
        status: 'in_progress',
        progress: 45,
        currentStep: 'Writing auth logic',
        lastUpdate: '2025-10-15T14:35:00Z',
      };

      cache.set(statusKey, JSON.stringify(statusData));

      const retrieved = JSON.parse(cache.get(statusKey) as string);
      expect(retrieved.status).toBe('in_progress');
      expect(retrieved.progress).toBe(45);
    });

    it('should update status multiple times', () => {
      const statusKey = 'status:agent-implementation-1:3.1';

      // Initial status
      cache.set(statusKey, JSON.stringify({ status: 'pending', progress: 0 }));

      // Update 1
      cache.set(
        statusKey,
        JSON.stringify({ status: 'in_progress', progress: 25 })
      );

      // Update 2
      cache.set(
        statusKey,
        JSON.stringify({ status: 'in_progress', progress: 75 })
      );

      // Final status
      cache.set(
        statusKey,
        JSON.stringify({ status: 'completed', progress: 100 })
      );

      const final = JSON.parse(cache.get(statusKey) as string);
      expect(final.status).toBe('completed');
      expect(final.progress).toBe(100);
    });

    it('should track multiple agent statuses', () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      agents.forEach((agent, index) => {
        const statusKey = `status:${agent}:task-1`;
        cache.set(
          statusKey,
          JSON.stringify({
            status: 'in_progress',
            progress: (index + 1) * 30,
          })
        );
      });

      agents.forEach((agent, index) => {
        const statusKey = `status:${agent}:task-1`;
        const status = JSON.parse(cache.get(statusKey) as string);
        expect(status.progress).toBe((index + 1) * 30);
      });
    });
  });

  describe('Inter-Agent Messaging Pattern', () => {
    it('should store messages between agents', () => {
      const msgKey = 'msg:agent-implementation-1:agent-architect:1729012345';
      const message = {
        type: 'Question',
        from: 'agent-implementation-1',
        to: 'agent-architect',
        question: 'Should caching be configurable per user?',
        context: 'Implementing auth logic',
        timestamp: '2025-10-15T14:30:00Z',
      };

      cache.set(msgKey, JSON.stringify(message));

      const retrieved = JSON.parse(cache.get(msgKey) as string);
      expect(retrieved.type).toBe('Question');
      expect(retrieved.from).toBe('agent-implementation-1');
      expect(retrieved.to).toBe('agent-architect');
    });

    it('should handle message responses', () => {
      const questionKey = 'msg:impl-1:architect:123';
      const responseKey = 'msg:architect:impl-1:response:123';

      // Store question
      cache.set(
        questionKey,
        JSON.stringify({
          type: 'Question',
          question: 'Use JWT or sessions?',
        })
      );

      // Store response
      cache.set(
        responseKey,
        JSON.stringify({
          type: 'Response',
          answer: 'Use JWT for stateless API',
          inReplyTo: questionKey,
        })
      );

      const response = JSON.parse(cache.get(responseKey) as string);
      expect(response.type).toBe('Response');
      expect(response.inReplyTo).toBe(questionKey);
    });
  });

  describe('Progress Tracking Pattern', () => {
    it('should aggregate progress from multiple agents', () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      agents.forEach((agent, index) => {
        cache.set(
          `agent:${agent}:state`,
          JSON.stringify({
            status: index === 0 ? 'completed' : 'in_progress',
            taskId: `task-${index + 1}`,
          })
        );
      });

      const progressData = {
        totalTasks: 3,
        completedTasks: 0,
        inProgressTasks: 0,
        agentStatus: {} as Record<string, unknown>,
      };

      agents.forEach((agent) => {
        const status = cache.get(`agent:${agent}:state`);
        if (status) {
          const agentData = JSON.parse(status as string);
          progressData.agentStatus[agent] = agentData;
          if (agentData.status === 'completed') progressData.completedTasks++;
          if (agentData.status === 'in_progress')
            progressData.inProgressTasks++;
        }
      });

      cache.set('progress:global', JSON.stringify(progressData), 60);

      const globalProgress = JSON.parse(cache.get('progress:global') as string);
      expect(globalProgress.completedTasks).toBe(1);
      expect(globalProgress.inProgressTasks).toBe(2);
    });
  });
});
