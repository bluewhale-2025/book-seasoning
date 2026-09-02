/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

type TurnstileWidgetId = string;

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: "signup" | "login" | "password_reset";
      appearance: "interaction-only";
      "response-field": false;
      callback(token: string): void;
      "expired-callback"(): void;
      "error-callback"(): void;
    },
  ): TurnstileWidgetId;
  remove(widgetId: TurnstileWidgetId): void;
  reset(widgetId: TurnstileWidgetId): void;
}

interface Window {
  turnstile?: TurnstileApi;
}
