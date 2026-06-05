import { mentorApi, userApi, authApi } from '@shared/lib/api';
import type { UpdateMeRequest } from '@shared/types/api';

export const mentorService = {
  getOverview: () => mentorApi.getMyOverview(),
  listMyStudents: () => mentorApi.getMyStudents(),
  getStudent: (id: number) => userApi.get(id),
  updateMe: (body: UpdateMeRequest) => authApi.updateMe(body),
  changePassword: (oldPassword: string, newPassword: string) =>
    authApi.changePassword(oldPassword, newPassword),
};
