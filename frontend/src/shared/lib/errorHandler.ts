import axios from 'axios';

/**
 * 提取 axios / 普通 Error / 任意值的错误描述字符串。
 *
 * 与 {@link getErrorMessage} 的区别：本函数失败时回退到 `error.message`
 * 或 `String(error)`，不附带通用兜底文案，适合需要把原始信息透传给
 * 业务表单或 toast 的场景。
 */
export function extractError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail ?? error.message;
  }
  return String(error);
}

/**
 * 提取错误描述，并保证总有兜底文案。
 *
 * 与 {@link extractError} 的区别：失败时回退到「请求失败」/「发生未知
 * 错误，请稍后重试」等成品文案，适合直接展示给最终用户的 toast。
 */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data?.detail as string) ?? err.message ?? '请求失败';
  }
  if (err instanceof Error) return err.message;
  return '发生未知错误，请稍后重试';
}

export function handleMutationError(
  err: unknown,
  showToast: (msg: string, type: 'success' | 'error') => void,
): void {
  showToast(getErrorMessage(err), 'error');
}
