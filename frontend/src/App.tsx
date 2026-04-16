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
import ConversationsPage from '@/pages/ConversationsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import SettingsPage from '@/pages/SettingsPage'
import StudentHomePage from '@/pages/student/StudentHomePage'
import StudentFaqPage from '@/pages/student/StudentFaqPage'
import StudentProfilePage from '@/pages/student/StudentProfilePage'
import { useAuth } from '@/hooks/useAuth'

function RoleRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'student' ? '/s' : '/admin'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 登录路由 */}
          <Route path="/admin/login" element={<LoginPage variant="admin" />} />
          <Route path="/s/login" element={<LoginPage variant="student" />} />
          {/* 兜底：旧 /login 重定向到管理端登录 */}
          <Route path="/login" element={<Navigate to="/admin/login" replace />} />

          {/* 管理员 + 教师：管理功能 */}
          <Route path="admin" element={<RouteGuard allowedRoles={['admin', 'teacher']} />}>
            <Route element={<AppLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="knowledge" element={<KnowledgeBasePage />} />
              <Route path="documents" element={<DocumentPage />} />
              <Route path="faq" element={<FaqPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>

          {/* 学生端 */}
          <Route element={<RouteGuard allowedRoles={['student']} />}>
            <Route element={<StudentLayout />}>
              <Route path="s" element={<StudentHomePage />} />
              <Route path="s/chat" element={<ConversationsPage />} />
              <Route path="s/faq" element={<StudentFaqPage />} />
              <Route path="s/profile" element={<StudentProfilePage />} />
            </Route>
          </Route>

          {/* 角色感知重定向 */}
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
