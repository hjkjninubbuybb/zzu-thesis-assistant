import axios from "axios";

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data?.detail as string) ?? err.message ?? "请求失败";
  }
  if (err instanceof Error) return err.message;
  return "发生未知错误，请稍后重试";
}

export function handleMutationError(
  err: unknown,
  showToast: (msg: string, type: "success" | "error") => void,
): void {
  showToast(getErrorMessage(err), "error");
}
