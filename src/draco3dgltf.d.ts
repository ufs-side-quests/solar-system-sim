// draco3dgltf ships no types. The unit tests use only the decoder factory,
// whose module goes to @gltf-transform's registerDependencies as unknown.
declare module "draco3dgltf" {
  const draco3d: Readonly<{ createDecoderModule: () => Promise<unknown> }>;
  export default draco3d;
}
