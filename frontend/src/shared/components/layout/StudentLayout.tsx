import { Outlet } from 'react-router-dom';
import StudentSidebar from '@shared/components/layout/StudentSidebar';
import BlobBackdrop from '@shared/components/layout/BlobBackdrop';

export default function StudentLayout() {
  return (
    <div
      data-theme="student"
      className="relative flex h-screen w-full bg-background p-3 gap-3 overflow-hidden"
    >
      <BlobBackdrop variant="cool" />
      <div className="relative z-10 flex w-full h-full gap-3">
        <StudentSidebar />
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
