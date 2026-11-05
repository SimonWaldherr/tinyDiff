// Shared by app integration checks. Observe state changes instead of sleeping.
export function waitForDOM(document, predicate) {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(check);
    const finish = (error) => {
      clearTimeout(timer);
      observer.disconnect();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error('App state timeout')), 10000);
    function check() {
      try {
        if (predicate()) finish();
      } catch (error) {
        finish(error);
      }
    }
    observer.observe(document, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true
    });
    check();
  });
}

export async function loadTestApp(frame) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('App load timeout')), 10000);
    frame.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    frame.src = '../site/';
  });
  return frame.contentDocument;
}
