---
name: ideogram4
description: Generate or edit images locally with Ideogram 4 via ComfyUI — the agent writes the model's structured JSON captions DIRECTLY (no helper LLM), validates them, renders through a minimal API graph, then inspects the result and iterates. Use when asked to generate an image locally, create logos/posters/thumbnails/readable-text images, do precise spatial/regional composition, img2img-restyle an existing image with Ideogram 4, or whenever Ideogram/ComfyUI image generation comes up. Personal use only (non-commercial weights).
---

# ideogram4 — drive Ideogram 4 locally, end to end

Ideogram 4 (open-weight, 9.3B) is prompted with **structured JSON captions**,
not natural language. You — the agent — are the prompt builder: you translate
the user's intent into the JSON schema, validate, render via ComfyUI's HTTP
API, then **read the output image** and refine. No Gemma/helper-LLM middleman.

**License gate:** the weights are NON-COMMERCIAL. Personal/learning use only.
If the request is for commercial/client work, say so and stop.

## The loop

1. **Write the caption** — JSON per [references/schema.md](references/schema.md)
   (exact key orders matter; the model was trained on them). Apply
   [references/craft.md](references/craft.md) for composition decisions and
   [references/genres.md](references/genres.md) for the genre's vocabulary.
2. **Validate** (always — schema errors masquerade as "safety blocked" cards):
   ```bash
   python3 ~/.claude/skills/ideogram4/scripts/validate.py caption.json
   # --fix reorders keys canonically; prints minified caption to stdout
   ```
3. **Generate** (ComfyUI must be running on the battlestation; WSL reaches it at localhost:8188):
   ```bash
   python3 ~/.claude/skills/ideogram4/scripts/generate.py \
     --prompt-file caption.json --width 1024 --height 1024 \
     --preset default --out /tmp/ideo
   # presets: turbo=12 steps (drafts) | default=28 | quality=48 (finals)
   # img2img: add --image input.png --denoise 0.6 (see craft.md for denoise ranges)
   ```
   First generation loads ~27GB into VRAM — slow once, fast after.
4. **Look at the result** (Read the printed PNG path). Compare element-by-element
   against the caption. Fix caption → revalidate → regenerate. Keep the seed
   (`--seed N`) fixed while iterating composition; randomize for final takes.

## Schema in one breath

```json
{"high_level_description":"1-2 sentences, ≤50 words, starts with the subject",
 "style_description":{"aesthetics":"…","lighting":"…","photo|art_style":"…","medium":"…","color_palette":["#RRGGBB"]},
 "compositional_deconstruction":{"background":"environment only — subjects are elements",
  "elements":[{"type":"obj","bbox":[y1,x1,y2,x2],"desc":"…","color_palette":["#…"]},
              {"type":"text","bbox":[…],"text":"LITERAL TEXT","desc":"font/size/color/placement"}]}}
```
- `photo` (cameras/lenses, medium "photograph") **or** `art_style` — never both;
  key order differs per variant (schema.md).
- bbox `[y_min,x_min,y_max,x_max]`, 0–1000, top-left origin, **optional** —
  it's a midpoint+extent *hint*, not a stretch box. Element order = z-order.
- Single subject = single element (parts go in `desc`). 4–7 elements default.
- Palettes: ≤16 global / ≤5 per element, uppercase hex. 2048-token cap.
- No `negative_prompt`, no `aspect_ratio` keys — constraints go in prose;
  aspect ratio comes from `--width/--height`.
- Minified, `ensure_ascii=False`. validate.py enforces all of this.

## Things that bite

| Symptom | Reality |
|---|---|
| Gray "Image blocked by safety filter" | Often a **malformed caption**, not censorship. Validate first. |
| i2i ignores "change X" instructions | No edit mode — describe the **full target image**; input only seeds the latent. |
| i2i ignores painted masks | Masks aren't wired in this pipeline; inpainting silently no-ops. |
| Identical results every run | Seed is fixed; pass a new `--seed` or omit for random. |
| Text renders garbled | Shrink the string, enlarge its bbox, raise contrast in `desc` — and use `--preset quality` (48 steps); glyph fidelity needs the extra steps. |
| Caption truncated / quality collapse | Over the 2048-token cap — cut elements/desc fat. |

## Plumbing facts (for debugging)

Graph (all core ComfyUI nodes): `UNETLoader(ideogram4_fp8_scaled)` +
`UNETLoader(ideogram4_unconditional_fp8_scaled)` → `ModelSamplingAuraFlow(shift 5)`
→ `CFGOverride(cfg 3, 70–100%)` → `DualModelGuider(cfg 5, negative=ConditioningZeroOut)`
→ `SamplerCustomAdvanced(euler + simple scheduler)` → `flux2-vae`. CLIP =
`qwen3vl_8b_fp8_scaled` loaded as type `ideogram4`. There is no negative-prompt
conditioning anywhere — guidance comes from the dual-model pair. t2i latent =
`EmptyFlux2LatentImage`; i2i = `LoadImage → ImageScale → VAEEncode` with
partial denoise. `generate.py --url` / `COMFY_URL` override the endpoint.
