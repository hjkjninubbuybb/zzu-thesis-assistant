export const userKeys = {
  all: () => ['users'] as const,
  list: (role?: string) => ['users', 'list', role ?? 'all'] as const,
  mentors: () => ['users', 'mentor-relations'] as const,
  mentorStudents: (mentorId: number) => ['mentor-students', mentorId] as const,
};
