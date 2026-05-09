import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/components/AuthProvider'
import RouteGuard from '@/components/RouteGuard'
import AppLayout from '@/components/layout/AppLayout'
import StudentLayout from '@/components/layout/StudentLayout'
import LoginPage from '@/pages/LoginPage'
import OverviewPage from '@/pages/OverviewPage'
import KnowledgeBasePage from '@/pages/KnowledgeBasePage'
import DocumentPage from '@/pages/DocumentPage'
import FaqPage from '@/pages/FaqPage'
import StudentsPage from '@/pages/StudentsPage'
import TeachersPage from '@/pages/TeachersPage'
import TicketsPage from '@/pages/TicketsPage'
import ConversationsPage from '@/pages/ConversationsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import SettingsPage from '@/pages/SettingsPage'
import StudentHomePage from '@/pages/student/StudentHomePage'
import StudentFaqPage from '@/pages/student/StudentFaqPage'
import StudentProfilePage from '@/pages/student/StudentProfilePage'
import StudentTicketsPage from '@/pages/student/StudentTicketsPage'
import { useAuth } from '@/hooks/useAuth'
import { UploadProvider } from '@/lib/uploadContext'

function RoleRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'student' ? '/student' : '/admin'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UploadProvider>
        <Routes>
          {/* 登录路由 */}
          <Route path="/admin/login" element={<LoginPage variant="admin" />} />
          <Route path="/student/login" element={<LoginPage variant="student" />} />
          {/* 兜底：旧 /login 重定向到管理端登录 */}
          <Route path="/login" element={<Navigate to="/admin/login" replace />} />

          {/* 管理员 + 教师：通用管理功能 */}
          <Route path="admin" element={<RouteGuard allowedRoles={['admin', 'teacher']} />}>
            <Route element={<AppLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="faq" element={<FaqPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              
              {/* 仅管理员可见的功能 */}
              <Route element={<RouteGuard allowedRoles={['admin']} />}>
                <Route path="knowledge" element={<KnowledgeBasePage />} />
                <Route path="documents" element={<DocumentPage />} />
                <Route path="teachers" element={<TeachersPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          {/* 学生端 */}
          <Route path="student" element={<RouteGuard allowedRoles={['student']} />}>
            <Route element={<StudentLayout />}>
              <Route index element={<StudentHomePage />} />
              <Route path="chat" element={<ConversationsPage />} />
              <Route path="faq" element={<StudentFaqPage />} />
              <Route path="tickets" element={<StudentTicketsPage />} />
              <Route path="profile" element={<StudentProfilePage />} />
            </Route>
          </Route>

          {/* 角色感知重定向 */}
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
        </UploadProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
