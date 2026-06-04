import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthUser, useHydrate, useSetPortal } from '@shared/store/authStore';
import { getCurrentPortal } from '@shared/lib/auth';
import RouteGuard from '@shared/components/auth/RouteGuard';
import AppLayout from '@shared/components/layout/AppLayout';
import StudentLayout from '@shared/components/layout/StudentLayout';
import { Providers } from './providers';

// Admin pages
const LoginPage = lazy(() => import('@pages/admin/LoginPage'));
const OverviewPage = lazy(() => import('@pages/admin/OverviewPage'));
const KnowledgePage = lazy(() => import('@pages/admin/KnowledgePage'));
const DocumentsPage = lazy(() => import('@pages/admin/DocumentsPage'));
const DocumentCleanReviewPage = lazy(() => import('@pages/admin/DocumentCleanReviewPage'));
const DocumentChunkReviewPage = lazy(() => import('@pages/admin/DocumentChunkReviewPage'));
const ConversationsPage = lazy(() => import('@pages/admin/ConversationsPage'));
const UsersPage = lazy(() => import('@pages/admin/UsersPage'));
const TicketsPage = lazy(() => import('@pages/admin/TicketsPage'));
const AnalyticsPage = lazy(() => import('@pages/admin/AnalyticsPage'));
const SettingsPage = lazy(() => import('@pages/admin/SettingsPage'));

// Student pages
const StudentHomePage = lazy(() => import('@pages/student/StudentHomePage'));
const ChatPage = lazy(() => import('@pages/student/ChatPage'));
const StudentFaqPage = lazy(() => import('@pages/student/FaqPage'));
const StudentTicketsPage = lazy(() => import('@pages/student/TicketsPage'));
const StudentProfilePage = lazy(() => import('@pages/student/ProfilePage'));

function RoleRedirect() {
  const user = useAuthUser();
  if (!user) return <Navigate to="/admin/login" replace />;
  return <Navigate to={user.role === 'student' ? '/student' : '/admin'} replace />;
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
        <Suspense fallback={null}>
          <Routes>
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/student/login" element={<LoginPage variant="student" />} />
            <Route path="/login" element={<Navigate to="/admin/login" replace />} />

            <Route path="admin" element={<RouteGuard allowedRoles={['admin', 'teacher']} />}>
              <Route element={<AppLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="conversations" element={<ConversationsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="students" element={<Navigate to="/admin/users" replace />} />
                <Route path="tickets" element={<TicketsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />

                <Route element={<RouteGuard allowedRoles={['admin']} />}>
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
                  <Route path="teachers" element={<Navigate to="/admin/users" replace />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="student" element={<RouteGuard allowedRoles={['student']} />}>
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
        </Suspense>
      </Providers>
    </BrowserRouter>
  );
}
