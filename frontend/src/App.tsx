import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/components/AuthProvider'
import RouteGuard from '@/components/RouteGuard'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import OverviewPage from '@/pages/OverviewPage'
import KnowledgeBasePage from '@/pages/KnowledgeBasePage'
import DocumentPage from '@/pages/DocumentPage'
import FaqPage from '@/pages/FaqPage'
import StudentsPage from '@/pages/StudentsPage'
import ConversationsPage from '@/pages/ConversationsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import SettingsPage from '@/pages/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<LoginPage />} />

          {/* 管理员 + 教师：管理功能 */}
          <Route element={<RouteGuard allowedRoles={['admin', 'teacher']} />}>
            <Route element={<AppLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="knowledge" element={<KnowledgeBasePage />} />
              <Route path="documents" element={<DocumentPage />} />
              <Route path="faq" element={<FaqPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>

          {/* 所有已登录用户：对话功能 */}
          <Route element={<RouteGuard />}>
            <Route element={<AppLayout />}>
              <Route path="conversations" element={<ConversationsPage />} />
            </Route>
          </Route>

          {/* 学生默认落地页：对话 */}
          <Route path="*" element={<Navigate to="/conversations" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
