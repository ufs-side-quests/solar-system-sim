import { CustomToneMapping, NoToneMapping, ShaderChunk } from "three";
import type { ToneMapping } from "three";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyHueKeepingToneMapping,
  HUE_KEEPING_TONE_MAPPING,
} from "./tone-mapping";

const threeChunk = ShaderChunk.tonemapping_pars_fragment;

describe("hue-keeping tone mapping", () => {
  afterEach(() => {
    ShaderChunk.tonemapping_pars_fragment = threeChunk;
  });

  it("replaces three's empty CustomToneMapping once and selects it", () => {
    const renderer: { toneMapping: ToneMapping } = {
      toneMapping: NoToneMapping,
    };
    applyHueKeepingToneMapping(renderer);
    applyHueKeepingToneMapping(renderer);
    const chunk = ShaderChunk.tonemapping_pars_fragment;
    expect(renderer.toneMapping).toBe(CustomToneMapping);
    expect(chunk.split(HUE_KEEPING_TONE_MAPPING)).toHaveLength(2);
    expect(chunk.split("vec3 CustomToneMapping(")).toHaveLength(2);
  });

  it("refuses a three chunk it does not recognise", () => {
    ShaderChunk.tonemapping_pars_fragment = threeChunk.replace(
      "vec3 CustomToneMapping( vec3 color ) { return color; }",
      "vec3 CustomToneMapping( vec3 color ) { return color * 2.0; }",
    );
    expect(() => {
      applyHueKeepingToneMapping({ toneMapping: NoToneMapping });
    }).toThrow(/tonemapping_pars_fragment changed/u);
  });
});
