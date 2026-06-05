export const ROUTES = {
  // Admin
  ADMIN_LOGIN: '/admin/login',
  ADMIN_ROOT: '/admin',
  ADMIN_OVERVIEW: '/admin',
  ADMIN_KNOWLEDGE: '/admin/knowledge',
  ADMIN_DOCUMENTS: '/admin/documents',
  ADMIN_DOC_REVIEW: '/admin/document/:kbName/:docId/review',
  ADMIN_DOC_CHUNKS: '/admin/document/:kbName/:docId/chunks',
  ADMIN_CONVERSATIONS: '/admin/conversations',
  ADMIN_USERS: '/admin/users',
  ADMIN_TICKETS: '/admin/tickets',
  ADMIN_ANALYTICS: '/admin/analytics',
  ADMIN_SETTINGS: '/admin/settings',

  // Teacher
  TEACHER_LOGIN: '/teacher/login',
  TEACHER_ROOT: '/teacher',
  TEACHER_STUDENTS: '/teacher/students',
  TEACHER_STUDENT_DETAIL: '/teacher/students/:id',
  TEACHER_TICKETS: '/teacher/tickets',
  TEACHER_PROFILE: '/teacher/profile',

  // Student
  STUDENT_LOGIN: '/student/login',
  STUDENT_ROOT: '/student',
  STUDENT_CHAT: '/student/chat',
  STUDENT_FAQ: '/student/faq',
  STUDENT_TICKETS: '/student/tickets',
  STUDENT_PROFILE: '/student/profile',
} as const;

/** Build a concrete path by replacing :param tokens */
export function buildRoute(route: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((acc, [k, v]) => acc.replace(`:${k}`, v), route);
}
