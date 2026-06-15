export interface PNGMetadata {
  prompt?: unknown;
  workflow?: unknown;
}

export function extractComfyUIMetadata(arrayBuffer: ArrayBuffer): PNGMetadata {
  if (arrayBuffer.byteLength < 8) {
    throw new Error('Not a valid PNG file.');
  }

  const view = new DataView(arrayBuffer);

  if (
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a
  ) {
    throw new Error('Not a valid PNG file.');
  }

  let offset = 8;
  const result: PNGMetadata = {};

  while (offset < view.byteLength) {
    if (offset + 8 > view.byteLength) break;

    const length = view.getUint32(offset);
    const chunkType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );

    offset += 8;

    if (chunkType === 'tEXt') {
      if (offset + length > view.byteLength) break;

      const chunkData = new Uint8Array(arrayBuffer, offset, length);
      const nullByteIndex = chunkData.indexOf(0);

      if (nullByteIndex !== -1) {
        const keyword = new TextDecoder('ascii').decode(chunkData.subarray(0, nullByteIndex));

        if (keyword === 'prompt' || keyword === 'workflow') {
          const rawText = new TextDecoder('utf-8').decode(chunkData.subarray(nullByteIndex + 1));
          try {
            result[keyword] = JSON.parse(rawText);
          } catch {
            result[keyword] = rawText;
          }
        }
      }
    }

    offset += length + 4;
  }

  if (result.prompt && typeof result.prompt === 'object') {
    const promptObj = result.prompt as Record<string, { inputs?: { text?: string } }>;
    for (const nodeId of Object.keys(promptObj)) {
      try {
        const node = promptObj[nodeId];
        const textValue = node?.inputs?.text;
        if (textValue) {
          const json = JSON.parse(textValue);
          if (json && typeof json === 'object' && 'high_level_description' in json) {
            return { prompt: json };
          }
        }
      } catch { /* continue */ }
    }
  }

  return result;
}