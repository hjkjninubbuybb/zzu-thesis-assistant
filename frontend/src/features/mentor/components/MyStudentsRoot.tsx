// frontend/src/features/mentor/components/MyStudentsRoot.tsx
import { useMyStudents } from '../hooks/useMyStudents';
import { StudentCard } from './StudentCard';

export function MyStudentsRoot() {
  const { students, isLoading } = useMyStudents();
  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1F2937]">我的学生</h1>
        <p className="mt-1 text-sm text-[#6F7A75]">点击卡片查看学生详情与工单记录</p>
      </div>
      {isLoading ? (
        <div className="text-sm text-[#6F7A75]">加载中...</div>
      ) : students.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">暂无绑定学生。请联系管理员维护师生关系。</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => (
            <StudentCard key={s.id} student={s} />
          ))}
        </div>
      )}
    </div>
  );
}
