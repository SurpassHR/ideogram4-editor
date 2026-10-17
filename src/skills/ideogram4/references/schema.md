# Ideogram 4 JSON caption schema (canonical)

Source of truth: `ideogram-oss/ideogram4` → `docs/prompting.md` + `CaptionVerifier`.
The model was *trained* on this exact structure; deviating is allowed but samples
outside the training distribution (= worse quality, more fake "safety" blocks).

The model takes the caption as a **string**: minified JSON, `separators=(",",":")`,
`ensure_ascii=False` (keep non-ASCII literal, never `\uXXXX`).

> Note: there is NO `aspect_ratio` key in local/ComfyUI use — aspect ratio comes
> from the latent width/height. (Ideogram's hosted magic-prompt pipeline uses one
> internally; do not emit it here.) There is also NO `negative_prompt` key — fold
> negative constraints into `desc`/`background` prose ("clean background, no
> clutter, no text").

## Top level — exactly this order

```json
{
  "high_level_description": "…",        // optional, strongly recommended
  "style_description": { … },           // optional object
  "compositional_deconstruction": { … } // REQUIRED
}
```

## `high_level_description`

1–2 sentences, ≤ ~50 words. Reads like a short prompt, not an analysis — start
with the subject (never "this image shows"). Subject(s) + medium + overall
composition. Name pop-culture entities fully ("Eiffel Tower", "Mario (Nintendo
character)"). Granular detail belongs in elements, not here. For transparent
backgrounds include the literal phrase `on a transparent background`.

## `style_description`

Must contain **exactly one** of `photo` / `art_style`. `aesthetics`, `lighting`,
`medium` required whenever the object is present. `color_palette` optional, always last.

| Variant | Exact key order |
|---|---|
| Photo | `aesthetics`, `lighting`, `photo`, `medium`, `color_palette` |
| Non-photo | `aesthetics`, `lighting`, `medium`, `art_style`, `color_palette` |

- `photo`: camera/lens language ("85mm, f/1.4, shallow DoF, eye-level"). Pairs with `medium: "photograph"`.
- `art_style`: visual language for everything else ("flat vector, bold outlines").
- `medium`: `"photograph"`, `"digital illustration"`, `"3D render"`, `"oil painting"`, `"graphic_design"`, `"anime illustration"`, etc.
- `color_palette`: up to **16** uppercase `#RRGGBB` strings. Include background + subject + highlight + shadow colors; contrast pairs give controlled lighting.

## `compositional_deconstruction`

`background` (string) then `elements` (list) — both required, that order.

- `background`: environment ONLY — never the main subject (that's an element).
  Location, time of day, weather, surfaces, depth, atmosphere, negative space.

### Elements — exact key order per type

| Type | Key order |
|---|---|
| `"obj"` | `type`, `bbox`, `desc`, `color_palette` |
| `"text"` | `type`, `bbox`, `text`, `desc`, `color_palette` |

- `bbox`: **`[y_min, x_min, y_max, x_max]`**, normalized **0–1000**, origin
  top-left, y grows downward. Optional per element. NEVER x-first order.
- `text`: literal characters to render (only for text elements). `\n` for line breaks.
- `desc`: required, detailed visual description.
- `color_palette`: optional, up to **5** hex per element, harmonizing with the global palette.

## Verifier parity

`scripts/validate.py` enforces: required keys, exact key orders, hex format
(uppercase `#RRGGBB` only), bbox range/order, palette caps (16/5), token
estimate vs the **2048-token hard cap**, and `\uXXXX`-escape detection. Run it
before every generation — **schema errors render as gray "Image blocked by
safety filter" cards**, indistinguishable from real censorship.

## Full worked example

See the Max Verstappen example in `docs/prompting.md` (17 elements incl. many
small `text` logos with tight bboxes) — the gold standard for text-heavy,
precisely-laid-out captions. Compact pattern:

```json
{"high_level_description":"A golden retriever riding a skateboard down a sunny sidewalk.",
 "style_description":{"aesthetics":"warm, playful, vibrant","lighting":"bright afternoon sunlight, long soft shadows","photo":"shallow depth of field, eye-level, 85mm lens","medium":"photograph","color_palette":["#F5C542","#87CEEB","#4A4A4A","#FFFFFF","#2E8B57"]},
 "compositional_deconstruction":{"background":"A sun-drenched suburban sidewalk lined with green hedges and a white picket fence. Dappled light filters through overhead trees.",
  "elements":[
   {"type":"obj","bbox":[200,300,800,900],"desc":"A golden retriever with a fluffy coat, standing on a red skateboard with all four paws. Its tongue is out and ears are flapping in the wind."},
   {"type":"obj","bbox":[250,750,750,950],"desc":"A worn red skateboard with black wheels rolling along the concrete sidewalk."}]}}
```
