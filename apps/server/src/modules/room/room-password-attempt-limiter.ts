import { Injectable } from "@nestjs/common";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class RoomPasswordAttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  public isAllowed(actorUserId: string, roomId: string, now = Date.now()): boolean {
    const recent = this.recentFailures(actorUserId, roomId, now);
    return recent.length < MAX_ATTEMPTS;
  }

  public recordFailure(actorUserId: string, roomId: string, now = Date.now()): void {
    const key = this.key(actorUserId, roomId);
    this.failures.set(key, [...this.recentFailures(actorUserId, roomId, now), now]);
  }

  public clear(actorUserId: string, roomId: string): void {
    this.failures.delete(this.key(actorUserId, roomId));
  }

  private recentFailures(actorUserId: string, roomId: string, now: number): number[] {
    const key = this.key(actorUserId, roomId);
    const recent = (this.failures.get(key) ?? []).filter(
      (attemptedAt) => attemptedAt > now - WINDOW_MS,
    );
    if (recent.length === 0) {
      this.failures.delete(key);
    } else {
      this.failures.set(key, recent);
    }
    return recent;
  }

  private key(actorUserId: string, roomId: string): string {
    return `${actorUserId}:${roomId}`;
  }
}

