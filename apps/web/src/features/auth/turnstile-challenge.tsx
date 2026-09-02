import * as React from "react";

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | undefined;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const loaded = () => {
      if (window.turnstile) resolve();
      else reject(new Error("Turnstile API is unavailable"));
    };
    const failed = () => reject(new Error("Turnstile script failed to load"));

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  }).catch((error: unknown) => {
    scriptPromise = undefined;
    throw error;
  });

  return scriptPromise;
}

export type TurnstileChallengeHandle = Readonly<{ reset(): void }>;

type TurnstileChallengeProps = Readonly<{
  siteKey?: string;
  action: "signup" | "login" | "password_reset";
  onTokenChange(token: string | undefined): void;
}>;

export const TurnstileChallenge = React.forwardRef<
  TurnstileChallengeHandle,
  TurnstileChallengeProps
>(function TurnstileChallenge({ siteKey, action, onTokenChange }, ref) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const widgetIdRef = React.useRef<TurnstileWidgetId | undefined>(undefined);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");

  React.useImperativeHandle(ref, () => ({
    reset() {
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
      onTokenChange(undefined);
      setStatus("ready");
    },
  }), [onTokenChange]);

  React.useEffect(() => {
    if (!siteKey) return;
    let active = true;
    setStatus("loading");

    void loadTurnstile()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          "response-field": false,
          callback(token) {
            if (!active) return;
            setStatus("ready");
            onTokenChange(token);
          },
          "expired-callback"() {
            if (!active) return;
            onTokenChange(undefined);
          },
          "error-callback"() {
            if (!active) return;
            onTokenChange(undefined);
            setStatus("error");
          },
        });
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
      onTokenChange(undefined);
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      widgetIdRef.current = undefined;
    };
  }, [action, onTokenChange, siteKey]);

  if (!siteKey) return null;

  return (
    <div className="grid gap-2">
      <div ref={containerRef} />
      {status === "loading" && (
        <p role="status" className="text-caption m-0 text-muted-foreground">
          보안 확인을 준비하고 있습니다.
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-caption m-0 text-destructive">
          보안 확인을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
});
