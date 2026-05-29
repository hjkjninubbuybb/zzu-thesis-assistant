export const ticketKeys = {
  all: () => ["tickets"] as const,
  list: (scope: "all" | "mine") => ["tickets", scope] as const,
};
