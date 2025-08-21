/**
 * Mock Page Open Utility
 * 
 * Provides mock functionality for opening pages/URLs in tests.
 * This prevents actual browser/system calls during testing.
 */

import { vi } from 'vitest';

export interface MockPageOpenOptions {
  shouldSucceed?: boolean;
  delay?: number;
  error?: string;
}

/**
 * Mock implementation of page opening functionality
 */
export class MockPageOpen {
  private static instance: MockPageOpen;
  private openCalls: Array<{ url: string; timestamp: number }> = [];
  private mockOptions: MockPageOpenOptions = { shouldSucceed: true };

  static getInstance(): MockPageOpen {
    if (!MockPageOpen.instance) {
      MockPageOpen.instance = new MockPageOpen();
    }
    return MockPageOpen.instance;
  }

  /**
   * Configure mock behavior
   */
  configure(options: MockPageOpenOptions): void {
    this.mockOptions = { ...this.mockOptions, ...options };
  }

  /**
   * Mock page open function
   */
  async open(url: string): Promise<void> {
    this.openCalls.push({ url, timestamp: Date.now() });

    if (this.mockOptions.delay) {
      await new Promise(resolve => setTimeout(resolve, this.mockOptions.delay));
    }

    if (!this.mockOptions.shouldSucceed) {
      throw new Error(this.mockOptions.error || 'Failed to open page');
    }

    // Simulate successful page open
    console.log(`[MOCK] Page opened: ${url}`);
  }

  /**
   * Get all page open calls
   */
  getCalls(): Array<{ url: string; timestamp: number }> {
    return [...this.openCalls];
  }

  /**
   * Get the last page open call
   */
  getLastCall(): { url: string; timestamp: number } | null {
    return this.openCalls.length > 0 ? this.openCalls[this.openCalls.length - 1] : null;
  }

  /**
   * Clear all recorded calls
   */
  clearCalls(): void {
    this.openCalls = [];
  }

  /**
   * Reset mock to default state
   */
  reset(): void {
    this.openCalls = [];
    this.mockOptions = { shouldSucceed: true };
  }
}

/**
 * Global mock setup for common page opening modules
 */
export function setupMockPageOpen(): MockPageOpen {
  const mockPageOpen = MockPageOpen.getInstance();

  // Mock common page opening modules
  vi.mock('open', () => ({
    default: vi.fn().mockImplementation((url: string) => mockPageOpen.open(url)),
  }));

  vi.mock('opener', () => ({
    default: vi.fn().mockImplementation((url: string) => mockPageOpen.open(url)),
  }));

  // Mock child_process exec for system open commands
  vi.mock('child_process', async () => {
    const actual = await vi.importActual('child_process');
    return {
      ...actual,
      exec: vi.fn().mockImplementation((command: string, callback?: Function) => {
        if (command.includes('open ') || command.includes('start ') || command.includes('xdg-open ')) {
          const url = command.split(' ').pop() || '';
          mockPageOpen.open(url).then(() => {
            if (callback) callback(null, 'success', '');
          }).catch((error) => {
            if (callback) callback(error, '', error.message);
          });
        } else if (callback) {
          callback(null, 'success', '');
        }
      }),
    };
  });

  return mockPageOpen;
}

/**
 * Setup mock page open for a specific test suite
 */
export function setupTestPageOpen(): {
  mockPageOpen: MockPageOpen;
  expectPageOpened: (url: string) => void;
  expectNoPageOpened: () => void;
} {
  const mockPageOpen = setupMockPageOpen();

  return {
    mockPageOpen,
    expectPageOpened: (url: string) => {
      const lastCall = mockPageOpen.getLastCall();
      expect(lastCall).toBeTruthy();
      expect(lastCall?.url).toContain(url);
    },
    expectNoPageOpened: () => {
      expect(mockPageOpen.getCalls()).toHaveLength(0);
    },
  };
}
