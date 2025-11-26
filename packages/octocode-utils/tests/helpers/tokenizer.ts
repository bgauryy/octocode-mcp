import { createByEncoderName } from '@microsoft/tiktokenizer';

let tokenizerInstance: { encode: (text: string) => number[] } | null = null;
let initializationPromise: Promise<{
  encode: (text: string) => number[];
}> | null = null;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createTokenizerWithRetry(): Promise<{
  encode: (text: string) => number[];
}> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await createByEncoderName('cl100k_base');
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
      }
    }
  }

  throw new Error(
    `Failed to initialize tokenizer after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Gets or creates the tokenizer instance. Uses singleton pattern to avoid
 * multiple initializations and handles flaky BPE encoder loading with retries.
 */
export async function getTokenizer(): Promise<{
  encode: (text: string) => number[];
}> {
  if (tokenizerInstance) {
    return tokenizerInstance;
  }

  if (!initializationPromise) {
    initializationPromise = createTokenizerWithRetry().then(tokenizer => {
      tokenizerInstance = tokenizer;
      return tokenizer;
    });
  }

  return initializationPromise;
}

export function countTokens(text: string): number {
  if (!tokenizerInstance) {
    throw new Error(
      'Tokenizer not initialized. Call getTokenizer() in beforeAll first.'
    );
  }
  return tokenizerInstance.encode(text).length;
}

export function calculateTokenSavingsPercentage(
  jsonTokens: number,
  yamlTokens: number
): number {
  return Math.round(((jsonTokens - yamlTokens) / jsonTokens) * 100 * 100) / 100;
}
