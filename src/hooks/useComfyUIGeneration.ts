import { useCallback } from 'react';
import { useEditorStore } from '../store';
import { buildWorkflowPayload } from '../workflow/workflow-mutator';
import { waitForComfyUIResult } from '../utils/comfyui-api';

export function useComfyUIGeneration() {
  const apiUrl = useEditorStore(s => s.apiUrl);
  const seed = useEditorStore(s => s.seed);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const generateJSON = useEditorStore(s => s.generateJSON);
  const generationStatus = useEditorStore(s => s.generationStatus);
  const setGenerationStatus = useEditorStore(s => s.setGenerationStatus);
  const setGeneratedImageUrl = useEditorStore(s => s.setGeneratedImageUrl);

  const generate = useCallback(async () => {
    const jsonOutput = generateJSON();
    const jsonStr = JSON.stringify(jsonOutput, null, 2);

    setGenerationStatus('generating');

    try {
      const workflowPayload = buildWorkflowPayload({
        jsonPrompt: jsonStr,
        width: canvasW,
        height: canvasH,
        seed,
      });

      const postResp = await fetch(`${apiUrl}/api/prompt`, {
        method: 'POST',
        headers: { 'accept': '*/*', 'content-type': 'application/json' },
        body: JSON.stringify(workflowPayload),
      });

      if (!postResp.ok) {
        throw new Error(`Failed to submit prompt: ${postResp.status}`);
      }

      const { prompt_id } = await postResp.json();

      setGenerationStatus('polling');
      const results = await waitForComfyUIResult(prompt_id, apiUrl);

      setGeneratedImageUrl(results[0].imageUrl);
      setGenerationStatus('done');

      return results;
    } catch (err) {
      setGenerationStatus('error');
      throw err;
    }
  }, [apiUrl, seed, canvasW, canvasH, generateJSON, setGenerationStatus, setGeneratedImageUrl]);

  return { generate, generationStatus };
}