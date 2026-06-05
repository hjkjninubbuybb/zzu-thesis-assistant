import { Outlet } from 'react-router-dom';
import TeacherSidebar from '@shared/components/layout/TeacherSidebar';
import BlobBackdrop from '@shared/components/layout/BlobBackdrop';

export default function TeacherLayout() {
  return (
    <div
      data-theme="teacher"
      className="relative flex h-screen w-full p-3 gap-3 overflow-hidden"
      style={{ background: 'hsl(150 18% 93%)' }}
    >
      <BlobBackdrop variant="cool" />
      <div className="relative z-10 flex w-full h-full gap-3">
        <TeacherSidebar />
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
