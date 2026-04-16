import { Outlet } from 'react-router-dom'
import StudentSidebar from './StudentSidebar'

export default function StudentLayout() {
  return (
    <div data-theme="student" className="flex h-screen w-full bg-background p-3 gap-3 overflow-hidden">
      <StudentSidebar />
      <main className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
