import { userApi } from "@shared/lib/api";
import type { UserCreate, UserUpdate } from "@shared/types/api";

export const userService = {
  list: (params?: { role?: string; page?: number; page_size?: number }) =>
    userApi.list(params),
  create: (payload: UserCreate) => userApi.create(payload),
  update: (id: number, payload: UserUpdate) => userApi.update(id, payload),
  delete: (id: number) => userApi.delete(id),
  resetPassword: (id: number, newPassword: string) =>
    userApi.resetPassword(id, newPassword),
  // student profile
  updateStudentProfile: (
    id: number,
    body: Parameters<typeof userApi.updateStudentProfile>[1],
  ) => userApi.updateStudentProfile(id, body),
  // teacher profile
  updateTeacherProfile: (
    id: number,
    body: Parameters<typeof userApi.updateTeacherProfile>[1],
  ) => userApi.updateTeacherProfile(id, body),
  // import/export students
  downloadTemplate: () => userApi.downloadTemplate(),
  exportStudents: () => userApi.exportStudents(),
  importStudents: (file: File) => userApi.importStudents(file),
  // import/export teachers
  downloadTeacherTemplate: () => userApi.downloadTeacherTemplate(),
  exportTeachers: () => userApi.exportTeachers(),
  importTeachers: (file: File) => userApi.importTeachers(file),
  // mentor relations
  listMentorStudents: (mentorId: number) =>
    userApi.listMentorStudents(mentorId),
  addMentorRelations: (mentorId: number, studentIds: number[]) =>
    userApi.addMentorRelations(mentorId, studentIds),
  removeMentorRelation: (mentorId: number, studentId: number) =>
    userApi.removeMentorRelation(mentorId, studentId),
  downloadRelationsTemplate: () => userApi.downloadRelationsTemplate(),
  importMentorRelations: (file: File) => userApi.importMentorRelations(file),
};
