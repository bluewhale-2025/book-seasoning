import * as React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from "./turnstile-challenge";

afterEach(() => {
  delete window.turnstile;
});

describe("TurnstileChallenge", () => {
  it("returns the verified token and removes the widget on unmount", async () => {
    const onTokenChange = vi.fn();
    const remove = vi.fn();
    window.turnstile = {
      render: vi.fn((_container, options) => {
        options.callback("verified-token");
        return "widget-1";
      }),
      remove,
      reset: vi.fn(),
    };

    const view = render(
      <TurnstileChallenge
        siteKey="site-key"
        action="signup"
        onTokenChange={onTokenChange}
      />,
    );

    await waitFor(() => expect(onTokenChange).toHaveBeenCalledWith("verified-token"));
    expect(window.turnstile.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        action: "signup",
        appearance: "interaction-only",
        "response-field": false,
      }),
    );
    view.unmount();
    expect(remove).toHaveBeenCalledWith("widget-1");
    expect(onTokenChange).toHaveBeenLastCalledWith(undefined);
  });

  it("resets a consumed challenge", async () => {
    const onTokenChange = vi.fn();
    const reset = vi.fn();
    window.turnstile = {
      render: vi.fn(() => "widget-2"),
      remove: vi.fn(),
      reset,
    };
    const ref = React.createRef<TurnstileChallengeHandle>();

    render(
      <TurnstileChallenge
        ref={ref}
        siteKey="site-key"
        action="password_reset"
        onTokenChange={onTokenChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());
    ref.current?.reset();
    expect(reset).toHaveBeenCalledWith("widget-2");
    expect(onTokenChange).toHaveBeenCalledWith(undefined);
  });
});
