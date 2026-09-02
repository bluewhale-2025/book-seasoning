export function getSessionDeviceId(roomId: string): string {
  const key = `bookseasoning:session-device:${roomId}`;
  const current = sessionStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}
