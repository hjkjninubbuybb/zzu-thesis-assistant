export const ticketKeys = {
  all: () => ['tickets'] as const,
  list: (scope: 'all' | 'mine', page: number, studentId?: number) =>
    ['tickets', scope, page, studentId ?? 'any'] as const,
  detail: (id: number) => ['tickets', 'detail', id] as const,
};
