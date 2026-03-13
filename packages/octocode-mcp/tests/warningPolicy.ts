interface WarningPolicyState {
  allowedStderrWarnings: Array<string | RegExp>;
  observedStderrWarnings: string[];
  suppressUnexpectedWarningFailure: boolean;
}

const WARNING_POLICY_STATE_KEY = Symbol.for('octocode.test.warningPolicy');

function getWarningPolicyState(): WarningPolicyState {
  const globalState = globalThis as typeof globalThis & {
    [WARNING_POLICY_STATE_KEY]?: WarningPolicyState;
  };

  if (!globalState[WARNING_POLICY_STATE_KEY]) {
    globalState[WARNING_POLICY_STATE_KEY] = {
      allowedStderrWarnings: [],
      observedStderrWarnings: [],
      suppressUnexpectedWarningFailure: false,
    };
  }

  return globalState[WARNING_POLICY_STATE_KEY];
}

function matchesExpectedWarning(
  matcher: string | RegExp,
  message: string
): boolean {
  if (typeof matcher === 'string') {
    return message.includes(matcher);
  }

  return matcher.test(message);
}

export function allowExpectedStderrWarning(matcher: string | RegExp): void {
  getWarningPolicyState().allowedStderrWarnings.push(matcher);
}

export function consumeExpectedStderrWarning(message: string): boolean {
  const state = getWarningPolicyState();
  const matchIndex = state.allowedStderrWarnings.findIndex(matcher =>
    matchesExpectedWarning(matcher, message)
  );

  if (matchIndex === -1) {
    return false;
  }

  state.allowedStderrWarnings.splice(matchIndex, 1);
  state.observedStderrWarnings.push(message);
  return true;
}

export function getObservedStderrWarnings(): string[] {
  return [...getWarningPolicyState().observedStderrWarnings];
}

export function allowUnexpectedWarningFailureForCurrentTest(): void {
  getWarningPolicyState().suppressUnexpectedWarningFailure = true;
}

export function shouldSuppressUnexpectedWarningFailure(): boolean {
  return getWarningPolicyState().suppressUnexpectedWarningFailure;
}

export function resetExpectedStderrWarnings(): void {
  const state = getWarningPolicyState();
  state.allowedStderrWarnings.length = 0;
  state.observedStderrWarnings.length = 0;
  state.suppressUnexpectedWarningFailure = false;
}
