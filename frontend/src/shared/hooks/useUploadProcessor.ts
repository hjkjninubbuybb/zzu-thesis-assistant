import { useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { documentApi } from "@shared/lib/api";
import { getErrorMessage } from "@shared/lib/errorHandler";
import useUploadStore from "@shared/store/uploadStore";

/**
 * Mount once in AppLayout. Monitors the upload queue and processes pending
 * items serially. Uses a ref mirror to avoid async closure stale reads.
 */
export function useUploadProcessor() {
  const qc = useQueryClient();
  const queue = useUploadStore((s) => s.queue);
  const updateItem = useUploadStore((s) => s.updateItem);
  const queueRef = useRef(queue);
  const runningRef = useRef(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const hasPending = queue.some((q) => q.status === "pending");
    if (!hasPending || runningRef.current) return;

    const process = async () => {
      runningRef.current = true;
      while (true) {
        const pending = queueRef.current.find((q) => q.status === "pending");
        if (!pending) break;

        updateItem(pending.id, { status: "uploading", progress: 0 });

        try {
          const doc = await documentApi.uploadAndClean(
            pending.kbName,
            pending.file,
            pending.params,
            (pct) => updateItem(pending.id, { progress: pct }),
          );
          updateItem(pending.id, {
            status: "done",
            progress: 100,
            cleanResult: doc,
          });
          qc.invalidateQueries({ queryKey: ["documents", pending.kbName] });
          qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
        } catch (e) {
          updateItem(pending.id, {
            status: "error",
            errorMsg: getErrorMessage(e),
          });
        }
      }
      runningRef.current = false;
    };

    process();
  }, [queue, updateItem, qc]);
}
