export function createBrowserPlatform() {
  return {
    getRuntimeInfo() {
      return {
        runtime: 'browser',
        online: navigator.onLine
      };
    },
    onNetworkChange(callback) {
      const handler = () => callback(navigator.onLine);
      window.addEventListener('online', handler);
      window.addEventListener('offline', handler);
      return () => {
        window.removeEventListener('online', handler);
        window.removeEventListener('offline', handler);
      };
    },
    openExternal(url) {
      if (!/^https?:\/\//i.test(url)) throw new Error('Only http/https URLs are supported');
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
}
