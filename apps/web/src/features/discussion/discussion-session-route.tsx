import { Navigate, useParams } from "react-router-dom";

import { DiscussionSessionPage } from "./discussion-session-page";

export function DiscussionSessionRoute() {
  const { roomId } = useParams();
  if (!roomId) return <Navigate to="/" replace />;
  return <DiscussionSessionPage roomId={roomId} />;
}
