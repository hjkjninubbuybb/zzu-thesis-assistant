import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthUser, useHydrate, useSetPortal } from '@shared/store/authStore';
import { getCurrentPortal } from '@shared/lib/auth';
import RouteGuard from '@shared/components/auth/RouteGuard';
import AppLayout from '@shared/components/layout/AppLayout';
import StudentLayout from '@shared/components/layout/StudentLayout';
import TeacherLayout from '@shared/components/layout/TeacherLayout';
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

// Teacher pages
const TeacherHomePage = lazy(() => import('@pages/teacher/TeacherHomePage'));
const MyStudentsPage = lazy(() => import('@pages/teacher/MyStudentsPage'));
const MyStudentDetailPage = lazy(() => import('@pages/teacher/MyStudentDetailPage'));
const TeacherTicketsPage = lazy(() => import('@pages/teacher/TeacherTicketsPage'));
const TeacherProfilePage = lazy(() => import('@pages/teacher/TeacherProfilePage'));

// Student pages
const StudentHomePage = lazy(() => import('@pages/student/StudentHomePage'));
const ChatPage = lazy(() => import('@pages/student/ChatPage'));
const StudentFaqPage = lazy(() => import('@pages/student/FaqPage'));
const StudentTicketsPage = lazy(() => import('@pages/student/TicketsPage'));
const StudentProfilePage = lazy(() => import('@pages/student/ProfilePage'));

function RoleRedirect() {
  const user = useAuthUser();
  if (!user) return <Navigate to="/admin/login" replace />;
  const target =
    user.role === 'student' ? '/student' : user.role === 'teacher' ? '/teacher' : '/admin';
  return <Navigate to={target} replace />;
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
            <Route path="/teacher/login" element={<LoginPage variant="teacher" />} />
            <Route path="/login" element={<Navigate to="/admin/login" replace />} />

            <Route path="admin" element={<RouteGuard allowedRoles={['admin']} />}>
              <Route element={<AppLayout />}>
                <Route index element={<OverviewPage />} />
                <Route path="conversations" element={<ConversationsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="students" element={<Navigate to="/admin/users" replace />} />
                <Route path="tickets" element={<TicketsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
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

            <Route path="teacher" element={<RouteGuard allowedRoles={['teacher']} />}>
              <Route element={<TeacherLayout />}>
                <Route index element={<TeacherHomePage />} />
                <Route path="students" element={<MyStudentsPage />} />
                <Route path="students/:id" element={<MyStudentDetailPage />} />
                <Route path="tickets" element={<TeacherTicketsPage />} />
                <Route path="profile" element={<TeacherProfilePage />} />
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
