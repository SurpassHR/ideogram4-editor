export async function waitForComfyUIResult(
  promptId: string,
  serverUrl: string,
  pollInterval = 3000,
  timeout = 300000,
  fetchImages = true,
): Promise<Array<{ nodeId: string; imageUrl: string; filename: string; subfolder: string; type: string; blob?: Blob }>> {
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timed out waiting for prompt ${promptId}`);
    }

    const response = await fetch(`${serverUrl}/history/${encodeURIComponent(promptId)}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`);
    }

    const history = await response.json();

    if (history[promptId]) {
      const outputs = history[promptId].outputs || {};
      const results: Array<{ nodeId: string; imageUrl: string; filename: string; subfolder: string; type: string; blob?: Blob }> = [];

      for (const nodeId of Object.keys(outputs)) {
        const nodeOutput = outputs[nodeId];
        if (!nodeOutput.images) continue;

        for (const img of nodeOutput.images) {
          const params = new URLSearchParams({
            filename: img.filename,
            subfolder: img.subfolder || '',
            type: img.type || 'output',
          });
          const imageUrl = `${serverUrl}/view?${params.toString()}`;

          const result: { nodeId: string; imageUrl: string; filename: string; subfolder: string; type: string; blob?: Blob } = {
            nodeId,
            imageUrl,
            filename: img.filename,
            subfolder: img.subfolder || '',
            type: img.type || 'output',
          };

          if (fetchImages) {
            const imgResponse = await fetch(imageUrl);
            result.blob = await imgResponse.blob();
          }

          results.push(result);
        }
      }

      return results;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}