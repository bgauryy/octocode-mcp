// Enable event domains in related out-of-process iframes. Each target keeps its own session.
export async function observeFrameEvents(cdp, domains = ['Network']) {
  // Under stealth, child targets pause until stealth resumes them with its overrides set.
  const attachParams = () =>
    cdp.stealthAutoAttach ?? {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    };
  const frames = new Map(),
    errors = [],
    pending = new Set();
  const attach = ({ sessionId, targetInfo }) => {
    if (targetInfo.type !== 'iframe') return;
    frames.set(sessionId, {
      targetId: targetInfo.targetId,
      url: targetInfo.url,
    });
    const task = (async () => {
      for (const domain of domains)
        await cdp.send(domain + '.enable', {}, sessionId);
      await cdp.send('Target.setAutoAttach', attachParams(), sessionId);
    })().catch(error => {
      errors.push({ targetId: targetInfo.targetId, error: error.message });
      console.log(
        `[FINDING] FRAME_EVENT_COVERAGE_UNAVAILABLE target=${targetInfo.targetId} ${error.message}`
      );
    });
    pending.add(task);
    task.finally(() => pending.delete(task));
  };
  cdp.on('Target.attachedToTarget', attach);
  try {
    await cdp.send('Target.setAutoAttach', attachParams());
  } catch (error) {
    errors.push({ error: error.message });
    console.log(`[FINDING] FRAME_EVENT_COVERAGE_UNAVAILABLE ${error.message}`);
  }
  return {
    coverage() {
      return {
        frames: [...frames.values()],
        errors,
        initialIframeRequestsMayPrecedeAttachment: true,
      };
    },
    async stop() {
      await Promise.allSettled([...pending]);
      // Stealth keeps attaching child targets to apply its overrides.
      await cdp
        .send(
          'Target.setAutoAttach',
          cdp.stealthAutoAttach ?? {
            autoAttach: false,
            waitForDebuggerOnStart: false,
            flatten: true,
          }
        )
        .catch(() => {});
      cdp.off('Target.attachedToTarget', attach);
    },
  };
}
