/*
 * Copyright (C) 2026 MYDCT
 *
 * Unit Tests for Worker Pool
 * Tests parallel execution, task queuing, and worker recycling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPool } from '../services/workerPool';

describe('WorkerPool', () => {
  let pool: WorkerPool;
  const mockWorkerUrl = new URL('../workers/technicals.worker.ts', import.meta.url).href;
  
  beforeEach(() => {
    // Mock Worker constructor
    global.Worker = vi.fn().mockImplementation(() => ({
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null
    }));
    
    pool = new WorkerPool(mockWorkerUrl, 4); // Max 4 workers for tests
  });
  
  afterEach(() => {
    pool.terminate();
    vi.clearAllMocks();
  });
  
  describe('Initialization', () => {
    it('should create pool with correct max workers', () => {
      const stats = pool.getStats();
      expect(stats.workers).toBe(0); // Lazy initialization
    });
    
    it('should initialize worker on first task', async () => {
      const task = pool.execute({ type: 'TEST' });
      
      // Worker should be created
      expect(global.Worker).toHaveBeenCalledWith(
        expect.stringContaining('technicals.worker'),
        { type: 'module' }
      );
    });
  });
  
  describe('Parallel Execution', () => {
    it('should handle multiple concurrent tasks', async () => {
      const tasks = [
        pool.execute({ type: 'CALC', data: 1 }),
        pool.execute({ type: 'CALC', data: 2 }),
        pool.execute({ type: 'CALC', data: 3 }),
        pool.execute({ type: 'CALC', data: 4 })
      ];
      
      const stats = pool.getStats();
      
      // Should create multiple workers (up to max)
      expect(stats.workers).toBeGreaterThan(1);
      expect(stats.workers).toBeLessThanOrEqual(4);
    });
    
    it('should queue tasks when all workers busy', async () => {
      // Create 5 tasks (more than MAX_WORKERS=4)
      const tasks = Array.from({ length: 5 }, (_, i) =>
        pool.execute({ type: 'CALC', data: i })
      );
      
      const stats = pool.getStats();
      
      // 4 workers max, so 1 task should be queued
      expect(stats.workers + stats.queued).toBe(5);
    });
  });
  
  describe('Worker Recycling', () => {
    it('should recycle worker after threshold tasks', async () => {
      const recycleSpy = vi.spyOn(pool as any, 'recycleWorker');
      
      // Simulate 100 tasks (RECYCLE_THRESHOLD)
      for (let i = 0; i < 100; i++) {
        const worker = (pool as any).workers[0];
        if (worker) {
          worker.taskCount = i + 1;
          
          if (i === 99) {
            // Trigger recycle
            (pool as any).handleMessage(
              { data: { id: 'test', payload: {} } },
              worker
            );
          }
        }
      }
      
      expect(recycleSpy).toHaveBeenCalled();
    });
  });
  
  describe('Error Handling', () => {
    it('should reject task on worker error', async () => {
      const task = pool.execute({ type: 'TEST' });
      
      // Si mulate worker error
      const worker = (pool as any).workers[0];
      if (worker && worker.worker.onerror) {
        worker.worker.onerror(new ErrorEvent('error'));
      }
      
      await expect(task).rejects.toThrow();
    });
    
    it('should reject task on timeout', async () => {
      vi.useFakeTimers();
      
      const task = pool.execute({ type: 'TEST' });
      
      // Fast-forward past timeout
      vi.advanceTimersByTime(6000); // WORKER_TIMEOUT = 5000
      
      await expect(task).rejects.toThrow('timeout');
      
      vi.useRealTimers();
    });
  });
  
  describe('Statistics', () => {
    it('should accurately report pool statistics', () => {
      // Execute some tasks
      pool.execute({ type: 'TEST1' });
      pool.execute({ type: 'TEST2' });
      
      const stats = pool.getStats();
      
      expect(stats).toHaveProperty('workers');
      expect(stats).toHaveProperty('busy');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('pending');
    });
  });
  
  describe('Termination', () => {
    it('should terminate all workers and clear state', () => {
      // Create some workers
      pool.execute({ type: 'TEST1' });
      pool.execute({ type: 'TEST2' });
      
      const workers = (pool as any).workers;
      const terminateSpies = workers.map((w: any) => 
        vi.spyOn(w.worker, 'terminate')
      );
      
      pool.terminate();
      
      // All workers should be terminated
      terminateSpies.forEach(spy => expect(spy).toHaveBeenCalled());
      
      // State should be cleared
      const stats = pool.getStats();
      expect(stats.workers).toBe(0);
      expect(stats.queued).toBe(0);
      expect(stats.pending).toBe(0);
    });
  });
});
