import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
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
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="knowledge" element={<KnowledgeBasePage />} />
          <Route path="documents" element={<DocumentPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
