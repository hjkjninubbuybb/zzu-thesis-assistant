export const studentKeys = {
  profile: () => ["student", "profile"] as const,
  recentChats: () => ["student", "recent-chats"] as const,
  allConversations: () => ["student", "all-conversations"] as const,
  activeKB: () => ["student", "active-kb"] as const,
};
