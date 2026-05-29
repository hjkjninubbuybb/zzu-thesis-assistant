import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthUser, useHydrate, useSetPortal } from "@shared/store/authStore";
import { getCurrentPortal } from "@shared/lib/auth";
import RouteGuard from "@shared/components/RouteGuard";
import AppLayout from "@shared/components/layout/AppLayout";
import StudentLayout from "@shared/components/layout/StudentLayout";
import { Providers } from "./providers";

// Admin pages
import LoginPage from "@pages/admin/LoginPage";
import OverviewPage from "@pages/admin/OverviewPage";
import KnowledgePage from "@pages/admin/KnowledgePage";
import DocumentsPage from "@pages/admin/DocumentsPage";
import DocumentCleanReviewPage from "@pages/admin/DocumentCleanReviewPage";
import DocumentChunkReviewPage from "@pages/admin/DocumentChunkReviewPage";
import ConversationsPage from "@pages/admin/ConversationsPage";
import UsersPage from "@pages/admin/UsersPage";
import TicketsPage from "@pages/admin/TicketsPage";
import AnalyticsPage from "@pages/admin/AnalyticsPage";
import SettingsPage from "@pages/admin/SettingsPage";

// Student pages
import StudentHomePage from "@pages/student/StudentHomePage";
import ChatPage from "@pages/student/ChatPage";
import StudentFaqPage from "@pages/student/FaqPage";
import StudentTicketsPage from "@pages/student/TicketsPage";
import StudentProfilePage from "@pages/student/ProfilePage";

function RoleRedirect() {
  const user = useAuthUser();
  if (!user) return <Navigate to="/admin/login" replace />;
  return (
    <Navigate to={user.role === "student" ? "/student" : "/admin"} replace />
  );
}

function AppInit() {
  const hydrate = useHydrate();
  const setPortal = useSetPortal();
  useEffect(() => {
    hydrate();
    setPortal(getCurrentPortal());
  }, [hydrate, setPortal]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppInit />
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route
            path="/student/login"
            element={<LoginPage variant="student" />}
          />
          <Route
            path="/login"
            element={<Navigate to="/admin/login" replace />}
          />

          <Route
            path="admin"
            element={<RouteGuard allowedRoles={["admin", "teacher"]} />}
          >
            <Route element={<AppLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route
                path="students"
                element={<Navigate to="/admin/users" replace />}
              />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />

              <Route element={<RouteGuard allowedRoles={["admin"]} />}>
                <Route path="knowledge" element={<KnowledgePage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route
                  path="document/:kbName/:docId/review"
                  element={<DocumentCleanReviewPage />}
                />
                <Route
                  path="document/:kbName/:docId/chunks"
                  element={<DocumentChunkReviewPage />}
                />
                <Route
                  path="teachers"
                  element={<Navigate to="/admin/users" replace />}
                />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route
            path="student"
            element={<RouteGuard allowedRoles={["student"]} />}
          >
            <Route element={<StudentLayout />}>
              <Route index element={<StudentHomePage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="faq" element={<StudentFaqPage />} />
              <Route path="tickets" element={<StudentTicketsPage />} />
              <Route path="profile" element={<StudentProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
