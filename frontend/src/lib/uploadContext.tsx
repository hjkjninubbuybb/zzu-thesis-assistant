import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { documentApi, extractError } from "@/lib/api";
import type { DocType, UploadParams, CleanResult } from "@/types/api";

export type UploadStatus = "pending" | "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  file: File;
  kbName: string;
  docType: DocType;
  params: UploadParams;
  status: UploadStatus;
  progress: number;
  chunkCount?: number;
  cleanResult?: CleanResult;
  errorMsg?: string;
}

interface UploadContextType {
  queue: UploadItem[];
  addFiles: (
    kbName: string,
    docType: DocType,
    files: File[],
    params: UploadParams,
  ) => void;
  removeItem: (id: string) => void;
  clearDone: (kbName: string, docType: DocType) => void;
  isUploading: boolean;
}

const UploadContext = createContext<UploadContextType | null>(null);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  // ref mirrors state so the async loop always reads fresh values
  const queueRef = useRef<UploadItem[]>([]);
  const runningRef = useRef(false);
  const qc = useQueryClient();

  const updateQueue = useCallback(
    (updater: (prev: UploadItem[]) => UploadItem[]) => {
      setQueue((prev) => {
        const next = updater(prev);
        queueRef.current = next;
        return next;
      });
    },
    [],
  );

  const startLoop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    while (true) {
      const pending = queueRef.current.find((q) => q.status === "pending");
      if (!pending) break;

      updateQueue((prev) =>
        prev.map((q) =>
          q.id === pending.id
            ? { ...q, status: "uploading" as const, progress: 0 }
            : q,
        ),
      );

      try {
        const doc = await documentApi.uploadAndClean(
          pending.kbName,
          pending.file,
          pending.params,
          (pct) =>
            updateQueue((prev) =>
              prev.map((q) =>
                q.id === pending.id ? { ...q, progress: pct } : q,
              ),
            ),
        );
        updateQueue((prev) =>
          prev.map((q) =>
            q.id === pending.id
              ? {
                  ...q,
                  status: "done" as const,
                  progress: 100,
                  cleanResult: doc,
                }
              : q,
          ),
        );
        qc.invalidateQueries({ queryKey: ["documents", pending.kbName] });
        qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
      } catch (e) {
        updateQueue((prev) =>
          prev.map((q) =>
            q.id === pending.id
              ? { ...q, status: "error" as const, errorMsg: extractError(e) }
              : q,
          ),
        );
      }
    }

    runningRef.current = false;
  }, [updateQueue, qc]);

  const addFiles = useCallback(
    (kbName: string, docType: DocType, files: File[], params: UploadParams) => {
      const items: UploadItem[] = files.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        kbName,
        docType,
        params,
        status: "pending" as const,
        progress: 0,
      }));
      updateQueue((prev) => [...prev, ...items]);
      startLoop();
    },
    [updateQueue, startLoop],
  );

  const removeItem = useCallback(
    (id: string) => {
      // only remove if not currently uploading
      updateQueue((prev) =>
        prev.filter((q) => !(q.id === id && q.status !== "uploading")),
      );
    },
    [updateQueue],
  );

  const clearDone = useCallback(
    (kbName: string, docType: DocType) => {
      updateQueue((prev) =>
        prev.filter(
          (q) =>
            !(
              q.kbName === kbName &&
              q.docType === docType &&
              (q.status === "done" || q.status === "error")
            ),
        ),
      );
    },
    [updateQueue],
  );

  const isUploading = queue.some(
    (q) => q.status === "uploading" || q.status === "pending",
  );

  return (
    <UploadContext.Provider
      value={{ queue, addFiles, removeItem, clearDone, isUploading }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
