import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { ProcessedBulkResult } from '../types.js';
import { getProvider } from '../providers/factory.js';
import {
  isProviderSuccess,
  type ICodeHostProvider,
  type ProviderCapabilities,
  type ProviderResponse,
  type ProviderType,
} from '../providers/types.js';
import { getActiveProvider, getActiveProviderConfig } from '../serverConfig.js';
import { maskSensitiveData } from '../security/mask.js';
import { handleProviderError } from './utils.js';

export interface ProviderExecutionContext {
  providerType: ProviderType;
  provider: ICodeHostProvider;
  capabilities: ProviderCapabilities;
  baseUrl?: string;
  token?: string;
  authInfo?: AuthInfo;
}

export class ProviderInitializationError extends Error {
  readonly providerType: ProviderType;

  constructor(providerType: ProviderType, message: string) {
    super(message);
    this.name = 'ProviderInitializationError';
    this.providerType = providerType;
  }
}

export interface ProviderOperationSpec<TMeta, TData> {
  meta: TMeta;
  operation: () => Promise<ProviderResponse<TData>>;
}

export interface ProviderOperationSuccess<TMeta, TData> {
  meta: TMeta;
  response: ProviderResponse<TData> & { data: TData };
}

export interface ProviderOperationFailure<TMeta, TData> {
  meta: TMeta;
  response: ProviderResponse<TData>;
}

export type ProviderOperationResult<TMeta, TData> =
  | ProviderOperationSuccess<TMeta, TData>
  | ProviderOperationFailure<TMeta, TData>;

function getCurrentProviderType(): ProviderType {
  return getActiveProviderConfig().provider ?? getActiveProvider();
}

function createProviderFailureResponse<TData>(
  error: unknown
): ProviderResponse<TData> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    error: maskSensitiveData(errorMessage),
    status: 500,
    provider: getCurrentProviderType(),
  };
}

export function createProviderExecutionContext(
  authInfo?: AuthInfo
): ProviderExecutionContext {
  const activeProviderConfig = getActiveProviderConfig();
  const providerType = activeProviderConfig.provider ?? getActiveProvider();
  const { baseUrl, token } = activeProviderConfig;

  try {
    const provider = getProvider(providerType, {
      type: providerType,
      baseUrl,
      token,
      authInfo,
    });

    return {
      providerType,
      provider,
      capabilities: provider.capabilities,
      baseUrl,
      token,
      authInfo,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown provider error';
    const sanitizedMessage = maskSensitiveData(errorMessage);
    throw new ProviderInitializationError(
      providerType,
      `Failed to initialize ${providerType} provider: ${sanitizedMessage}`
    );
  }
}

export function providerSupports(
  context: Pick<ProviderExecutionContext, 'capabilities'>,
  capability: keyof ProviderCapabilities
): boolean {
  return context.capabilities[capability];
}

export async function executeProviderOperation<
  TQuery extends {
    mainResearchGoal?: string;
    researchGoal?: string;
    reasoning?: string;
  },
  TData,
>(
  query: TQuery,
  operation: () => Promise<ProviderResponse<TData>>
): Promise<
  | { ok: true; response: ProviderResponse<TData> & { data: TData } }
  | { ok: false; result: ProcessedBulkResult }
> {
  const response = await operation();

  if (!isProviderSuccess(response)) {
    return {
      ok: false,
      result: handleProviderError(response, query),
    };
  }

  return {
    ok: true,
    response,
  };
}

export async function executeProviderOperations<TMeta, TData>(
  operations: Array<ProviderOperationSpec<TMeta, TData>>
): Promise<{
  successes: Array<ProviderOperationSuccess<TMeta, TData>>;
  failures: Array<ProviderOperationFailure<TMeta, TData>>;
}> {
  const responses: Array<ProviderOperationResult<TMeta, TData>> =
    await Promise.all(
      operations.map(async operation => {
        try {
          return {
            meta: operation.meta,
            response: await operation.operation(),
          };
        } catch (error) {
          return {
            meta: operation.meta,
            response: createProviderFailureResponse<TData>(error),
          };
        }
      })
    );

  const successes: Array<ProviderOperationSuccess<TMeta, TData>> = [];
  const failures: Array<ProviderOperationFailure<TMeta, TData>> = [];

  for (const response of responses) {
    if (isProviderSuccess(response.response)) {
      successes.push({
        meta: response.meta,
        response: response.response,
      });
    } else {
      failures.push({
        meta: response.meta,
        response: response.response,
      });
    }
  }

  return { successes, failures };
}
