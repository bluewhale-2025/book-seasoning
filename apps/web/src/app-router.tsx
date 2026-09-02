import { Outlet, createBrowserRouter } from "react-router-dom";

import { AppShell } from "./app/app-shell";
import { AuthProvider } from "./app/auth-provider";
import { BrowserRuntimeBoundary } from "./app/app-runtime";
import { AppRouteErrorBoundary } from "./app/route-error-boundary";
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignUpPage,
} from "./features/auth/auth-pages";
import {
  AuthenticatedIndexRoute,
  ProtectedRoute,
  PublicOnlyRoute,
} from "./features/auth/auth-route-guards";
import { AdminRoute } from "./features/admin/admin-route";

function BrowserAppLayout() {
  return (
    <BrowserRuntimeBoundary>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </BrowserRuntimeBoundary>
  );
}

export const appRouter = createBrowserRouter([
  {
    path: "/design-system",
    lazy: async () => {
      const module = await import("./app");
      return { Component: module.App };
    },
  },
  {
    element: <BrowserAppLayout />,
    errorElement: <AppRouteErrorBoundary />,
    children: [
      { path: "/", element: <AuthenticatedIndexRoute /> },
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: "/auth/login", element: <LoginPage /> },
          { path: "/auth/signup", element: <SignUpPage /> },
        ],
      },
      { path: "/auth/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/auth/reset", element: <ResetPasswordPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                path: "/discussions",
                lazy: async () => {
                  const module = await import("./features/rooms/my-discussions-page");
                  return { Component: module.MyDiscussionsPage };
                },
              },
              {
                path: "/discussions/find",
                lazy: async () => {
                  const module = await import("./features/rooms/room-search-page");
                  return { Component: module.RoomSearchPage };
                },
              },
              {
                path: "/rooms/new",
                lazy: async () => {
                  const module = await import("./features/rooms/create-room-page");
                  return { Component: module.CreateRoomPage };
                },
              },
              {
                path: "/rooms/:roomId",
                lazy: async () => {
                  const module = await import("./features/rooms/room-detail-page");
                  return { Component: module.RoomDetailPage };
                },
              },
              {
                path: "/profile",
                lazy: async () => {
                  const module = await import("./features/profile/profile-page");
                  return { Component: module.ProfilePage };
                },
              },
              {
                element: <AdminRoute />,
                children: [
                  {
                    path: "/admin/book-context",
                    lazy: async () => {
                      const module = await import("./features/admin/book-context-pack-list-page");
                      return { Component: module.BookContextPackListPage };
                    },
                  },
                  {
                    path: "/admin/book-context/:packVersionId",
                    lazy: async () => {
                      const module = await import("./features/admin/book-context-pack-page");
                      return { Component: module.BookContextPackPage };
                    },
                  },
                ],
              },
            ],
          },
          {
            path: "/rooms/:roomId/session",
            lazy: async () => {
              const module = await import(
                "./features/discussion/discussion-session-route"
              );
              return { Component: module.DiscussionSessionRoute };
            },
          },
        ],
      },
    ],
  },
]);
