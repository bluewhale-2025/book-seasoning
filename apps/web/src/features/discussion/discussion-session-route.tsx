import { Navigate, useParams } from "react-router-dom";

import { DiscussionSessionPage } from "./discussion-session-page";
import { AiDiagnosticsConsole } from "./ai-diagnostics-console";

export function DiscussionSessionRoute() {
  const { roomId } = useParams();
  if (!roomId) return <Navigate to="/" replace />;
  return <><AiDiagnosticsConsole roomId={roomId} /><DiscussionSessionPage roomId={roomId} /></>;
}
