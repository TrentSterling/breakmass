// Test-only native dialog observation. Never closes a dialog or replaces its methods.
// Serialized into the existing hosted page; CPU tests supply explicit DOM doubles.
export function installNativeCloseProbe(label, timeoutMs = 5000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('Invalid native close watchdog');
  if (window.__breakmassCloseProbe) throw Error('A native close probe is already active');
  const dialog = document.getElementById('confirm-reset');
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) throw Error('Expected an open native confirmation');
  const receipt = {label, timeoutMs, startedAt:performance.now(), passed:false, events:[]};
  const mark = (phase, extra = {}) => receipt.events.push({phase, at:performance.now(), open:dialog.open, value:dialog.returnValue, ...extra});
  let settled = false, timer, resolve;
  const result = new Promise(done => { resolve = done; });
  const finish = error => {
    if (settled) return;
    settled = true; clearTimeout(timer);
    dialog.removeEventListener('close', closed);
    dialog.removeEventListener('click', clicked, true);
    receipt.passed = !error; if (error) receipt.error = error;
    mark(error ? 'failed' : 'complete'); resolve(receipt);
  };
  const clicked = event => mark('click', {trusted:event.isTrusted});
  const closed = event => {
    mark('close', {trusted:event.isTrusted});
    finish(performance.now()-receipt.startedAt>=timeoutMs ? 'Native close event exceeded '+timeoutMs+' ms watchdog' :
      !event.isTrusted ? 'Expected a native close event' : dialog.open ? 'Dialog remains open after close' :
      dialog.returnValue !== 'cancel' ? 'Expected cancellation, got '+dialog.returnValue : null);
  };
  window.__breakmassCloseProbe = {receipt, result, cancel:finish};
  dialog.addEventListener('close', closed);
  dialog.addEventListener('click', clicked, true);
  mark('armed');
  timer = setTimeout(() => finish('Native close event timed out after '+timeoutMs+' ms'), timeoutMs);
  return true;
}

export async function waitForNativeCancel(page, action, receipts, label) {
  let failure, installed = false;
  try {
    // This CDP evaluation completes before the action can click Cancel/backdrop.
    await page.eval(`(${installNativeCloseProbe.toString()})(${JSON.stringify(label)})`);
    installed = true;
    await action();
    const result = await page.eval('window.__breakmassCloseProbe.result');
    if (!result?.passed) throw Error(result?.error || 'Missing native close result');
    return result;
  } catch (error) { failure = error; throw error; }
  finally {
    let receipt, cleanupError;
    try {
      if (installed) receipt = await page.eval(`(() => {
        const probe=window.__breakmassCloseProbe;if(!probe)return null;
        probe.cancel('Action ended without a native close result');
        delete window.__breakmassCloseProbe;return probe.receipt;
      })()`);
    } catch (error) { cleanupError = error; }
    receipts.push({...receipt, label, passed:!failure&&!cleanupError&&receipt?.passed===true,
      error:failure?.message || cleanupError?.message || receipt?.error});
    if (cleanupError && !failure) throw cleanupError;
  }
}
