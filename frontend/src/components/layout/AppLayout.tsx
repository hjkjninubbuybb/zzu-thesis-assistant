import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BlobBackdrop from './BlobBackdrop'

export default function AppLayout() {
  return (
    <div className="relative flex h-screen w-full bg-background p-3 gap-3 overflow-hidden">
      <BlobBackdrop variant="warm" />
      <div className="relative z-10 flex w-full h-full gap-3">
        <Sidebar />
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
