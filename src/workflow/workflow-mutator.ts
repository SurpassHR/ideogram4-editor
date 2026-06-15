import { COMFYUI_WORKFLOW_TEMPLATE } from './comfyui-workflow';

export function buildWorkflowPayload(params: {
  jsonPrompt: string;
  width: number;
  height: number;
  seed: number;
}): Record<string, unknown> {
  const workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE)) as Record<string, { inputs: Record<string, unknown> }>;

  workflow['98:24'].inputs.text = params.jsonPrompt;
  workflow['98:27'].inputs.value = params.width;
  workflow['98:28'].inputs.value = params.height;
  workflow['98:18'].inputs.noise_seed = params.seed;

  return { prompt: workflow };
}