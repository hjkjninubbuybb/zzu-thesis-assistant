export const mentorKeys = {
  all: () => ['mentor'] as const,
  overview: () => ['mentor', 'overview'] as const,
  students: () => ['mentor', 'students'] as const,
  student: (id: number) => ['mentor', 'student', id] as const,
};
