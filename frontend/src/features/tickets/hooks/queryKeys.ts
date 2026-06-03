export const ticketKeys = {
  all: () => ['tickets'] as const,
  list: (scope: 'all' | 'mine', page: number) => ['tickets', scope, page] as const,
};
