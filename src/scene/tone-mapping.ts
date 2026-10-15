import type { ToneMapping } from "three";
import { Color, CustomToneMapping, ShaderChunk } from "three";

import { SUNLIGHT_COLOR } from "./visual-assets";

// three's ACES Filmic tone maps each channel on its own, so a bright colour
// drifts towards yellow and white as its channels reach the shoulder at
// different times: it drew Mars tan and Io and Saturn nearly white. Khronos
// PBR Neutral keeps colour but has a short shoulder that pushes sunlit
// light-grey hulls to white. This curve keeps ACES's tone for every sunlit
// grey and keeps the hue and saturation of every surface.
//
// 1. Exposure: the input is scaled by toneMappingExposure / 0.6, as three's
//    ACES does, so the auto exposure, the manual exposure value, the ring
//    shaders' displayExposure and the lamp glow (which all read
//    toneMappingExposure) keep their meaning.
// 2. Tone: ACES's input and output matrices each have rows that sum to 1
//    (0.59719 + 0.35458 + 0.04823 = 1, 1.60475 - 0.53108 - 0.07367 = 1, and
//    so on), so ACES shows a grey of value g as RRTAndODTFit(g / 0.6) in all
//    three channels. The same curve is applied to one number per colour, so
//    a grey shows exactly as under ACES, with ACES's long shoulder: 0.76 at
//    1, 0.89 at 2, 0.97 at 5, 1 at 15.4.
// 3. The number is the largest channel after dividing by the sunlight's
//    colour, times the sunlight's luminance. For a grey lit by the Sun it is
//    the luminance, so an 18% grey facing the Sun shows at sRGB 177 as under
//    ACES. For a coloured surface it is at least the luminance, so scaling the
//    RGB by shown / number keeps every channel at or below
//    shown / sunlight luminance: inside the display while shown is at most
//    the sunlight luminance (0.899, sRGB 243). Below that the channel ratios,
//    so hue and saturation, are kept exactly.
// 4. Top: above the sunlight luminance the colour is mixed towards white
//    (the shown value in every channel) by
//      (shown - sunlight luminance) / (shown x (1 - sunlight luminance)),
//    the least mix that keeps the brightest channel at or below 1 by the bound
//    in 3. It is 0 at the sunlight luminance and 1 when shown reaches 1, so a
//    sunlit grey keeps its luminance and a lamp core reads white hot, as
//    under ACES.
const sunlight = new Color(SUNLIGHT_COLOR);
const sunlightLuminance =
  0.2126 * sunlight.r + 0.7152 * sunlight.g + 0.0722 * sunlight.b;
const glslFloat = (value: number): string => value.toFixed(6);

export const HUE_KEEPING_TONE_MAPPING = /* glsl */ `vec3 CustomToneMapping( vec3 color ) {
	const vec3 sunlight = vec3( ${[sunlight.r, sunlight.g, sunlight.b].map(glslFloat).join(", ")} );
	const float sunlightLuminance = ${glslFloat(sunlightLuminance)};
	color *= toneMappingExposure / 0.6;
	vec3 balanced = color / sunlight;
	float level = sunlightLuminance * max( balanced.r, max( balanced.g, balanced.b ) );
	if ( level <= 0.0 ) return vec3( 0.0 );
	float shown = saturate( RRTAndODTFit( vec3( level ) ).x );
	color *= shown / level;
	if ( shown <= sunlightLuminance ) return color;
	return mix( color, vec3( shown ), ( shown - sunlightLuminance ) / ( shown * ( 1.0 - sunlightLuminance ) ) );
}`;

const THREE_CUSTOM_TONE_MAPPING =
  "vec3 CustomToneMapping( vec3 color ) { return color; }";
const THREE_ACES_CURVE = "vec3 RRTAndODTFit( vec3 v ) {";

/** Call before any material compiles; the chunk is shared by all materials. */
export function applyHueKeepingToneMapping(renderer: {
  toneMapping: ToneMapping;
}): void {
  const chunk = ShaderChunk.tonemapping_pars_fragment;
  if (!chunk.includes(HUE_KEEPING_TONE_MAPPING)) {
    if (
      !chunk.includes(THREE_CUSTOM_TONE_MAPPING) ||
      !chunk.includes(THREE_ACES_CURVE)
    ) {
      throw new Error(
        "three tonemapping_pars_fragment changed: the hue-keeping tone mapping cannot be applied",
      );
    }
    ShaderChunk.tonemapping_pars_fragment = chunk.replace(
      THREE_CUSTOM_TONE_MAPPING,
      HUE_KEEPING_TONE_MAPPING,
    );
  }
  renderer.toneMapping = CustomToneMapping;
}
