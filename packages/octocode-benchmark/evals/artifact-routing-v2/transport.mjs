export function repairRequest(request,response,state,arm) {
  const next = structuredClone(request);
  const feedback = {kind:'argument_validation',transportError:state.normalized.transportError,
    errors:state.metrics.errors,instruction:'Correct the tool argument shape using this validation feedback and the original request. Do not invent missing identifiers. No provider operation was executed.'};
  const proposed=response.raw?.message?.tool_calls;
  const validNative=Array.isArray(proposed) && proposed.length>0 && proposed.every(call=>
    typeof call?.function?.name==='string' && call.function.arguments && typeof call.function.arguments==='object' && !Array.isArray(call.function.arguments));
  if (arm==='native' && validNative) {
    next.messages.push(response.raw.message);
    for (const call of response.raw.message.tool_calls) next.messages.push({role:'tool',tool_name:call.function?.name,content:JSON.stringify(feedback)});
  } else {
    if (response.raw?.message) next.messages.push({role:'assistant',content:JSON.stringify(response.raw.message)});
    next.messages.push({role:'user',content:JSON.stringify(feedback)});
  }
  return next;
}
