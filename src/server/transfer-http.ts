import { transferRequestSchema } from "../lib/transfer";
import { CatalogError } from "./catalog-management";

// JSON escaping may expand the original file; bound transport before decoding.
export const MAX_TRANSFER_REQUEST_BYTES = 60_001_024;
export async function readTransferRequest(request: Request) {
  if (!request.body) throw new CatalogError("请选择导入文件");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TRANSFER_REQUEST_BYTES) {
        await reader.cancel();
        throw new CatalogError("导入请求过大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CatalogError("导入请求不是有效 JSON");
  }
  return transferRequestSchema.parse(data);
}
