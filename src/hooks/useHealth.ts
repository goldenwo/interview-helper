import { useState, useEffect, useRef } from "react";

const PING_INTERVAL = 30_000; // 30 seconds

export function useHealth() {
  const [healthy, setHealthy] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const ping = async () => {
      try {
        const res = await fetch("/api/health", {
          method: "GET",
          signal: abortController.signal,
        });
        setHealthy(prev => prev === res.ok ? prev : res.ok);
        return res.ok;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return false;
        setHealthy(prev => prev ? false : prev);
        return false;
      }
    };

    // Initial ping with a quick retry if backend isn't ready yet
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    ping().then((ok) => {
      if (!ok && !abortController.signal.aborted) {
        retryTimer = setTimeout(ping, 2000);
      }
    });

    // Poll every 30s
    intervalRef.current = setInterval(ping, PING_INTERVAL);

    return () => {
      abortController.abort();
      clearTimeout(retryTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { healthy };
}
