import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

class ResizeObserverStub implements ResizeObserver {
  public readonly disconnect = (): void => undefined;
  public readonly observe = (): void => undefined;
  public readonly unobserve = (): void => undefined;
}

globalThis.ResizeObserver = ResizeObserverStub;
