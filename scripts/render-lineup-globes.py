"""Render the size-lineup pictures as lit globes from the installed maps.

Run through `pnpm data:lineup-globes`, which builds the job file from the
texture snapshot, the major-body radii and the ring constants, then calls:

    Blender -b --factory-startup --python scripts/render-lineup-globes.py -- <job.json>

Every source map is checked against its snapshot sha256 before use. The
camera, light and samples are fixed, so a rerun on the same Blender build
writes the same pixels.
"""

import hashlib
import json
import math
import sys

import bmesh
import bpy
from mathutils import Vector


def fail(message):
    raise SystemExit(f"render-lineup-globes: {message}")


def verified_image(path, expected_sha256):
    with open(path, "rb") as source:
        actual = hashlib.sha256(source.read()).hexdigest()
    if actual != expected_sha256:
        fail(f"{path} sha256 {actual} differs from the snapshot {expected_sha256}")
    image = bpy.data.images.load(path, check_existing=False)
    image.colorspace_settings.name = "sRGB"
    return image


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(color):
    return tuple(
        srgb_to_linear(int(color[index : index + 2], 16) / 255) for index in (1, 3, 5)
    ) + (1.0,)


def reset_scene(job):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = job["samples"]
    scene.cycles.use_adaptive_sampling = job["adaptiveSampling"]
    scene.cycles.use_denoising = job["denoising"]
    scene.cycles.seed = job["seed"]
    scene.cycles.max_bounces = job["transparentBounces"]
    scene.cycles.diffuse_bounces = 0
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.transparent_max_bounces = job["transparentBounces"]
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = job["webpQuality"]

    world = bpy.data.worlds.new("lineup-world")
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (1, 1, 1, 1)
    background.inputs["Strength"].default_value = job["ambientStrength"]
    scene.world = world
    return scene


def add_camera_and_light(scene, job, half_width, width, height):
    elevation = math.radians(job["cameraElevationDeg"])
    toward_camera = Vector((0, -math.cos(elevation), math.sin(elevation)))
    camera_data = bpy.data.cameras.new("lineup-camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 2 * half_width
    camera_data.sensor_fit = "HORIZONTAL"
    camera_data.clip_start = 0.01
    camera_data.clip_end = 100
    camera = bpy.data.objects.new("lineup-camera", camera_data)
    camera.location = toward_camera * 50
    camera_rotation = (-toward_camera).to_track_quat("-Z", "Z")
    camera.rotation_euler = camera_rotation.to_euler()
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.resolution_x = width
    scene.render.resolution_y = height

    # The light comes from the viewer's upper left, in front of the globe.
    camera_right = camera_rotation @ Vector((1, 0, 0))
    camera_up = camera_rotation @ Vector((0, 1, 0))
    toward_light = (-camera_right + camera_up + toward_camera).normalized()
    sun_data = bpy.data.lights.new("lineup-sun", "SUN")
    sun_data.energy = job["sunStrength"]
    sun_data.angle = math.radians(job["sunAngleDeg"])
    sun = bpy.data.objects.new("lineup-sun", sun_data)
    sun.rotation_euler = (-toward_light).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)


def surface_material(body):
    material = bpy.data.materials.new(f"{body['id']}-surface")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Specular IOR Level"].default_value = 0.0
    if "surfaceMap" in body:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = verified_image(body["surfaceMap"]["path"], body["surfaceMap"]["sha256"])
        texture.interpolation = "Cubic"
        links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    else:
        shader.inputs["Base Color"].default_value = hex_to_linear_rgba(body["materialColor"])
    return material


def add_globe(body, turn_deg):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=128, radius=1)
    globe = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    # The turn puts the map's centre column (u = 0.5) in front of the camera.
    globe.rotation_euler = (0, 0, math.radians(turn_deg))
    globe.scale = (body["equatorialRadius"], body["equatorialRadius"], body["polarRadius"])
    globe.data.materials.append(surface_material(body))
    return globe


def add_rings(body):
    rings = body["rings"]
    mesh = bpy.data.meshes.new(f"{body['id']}-rings")
    built = bmesh.new()
    uv_layer = built.loops.layers.uv.new()
    segments = 512
    inner = [
        built.verts.new((rings["innerRadius"] * math.cos(step), rings["innerRadius"] * math.sin(step), 0))
        for step in (2 * math.pi * index / segments for index in range(segments))
    ]
    outer = [
        built.verts.new((rings["outerRadius"] * math.cos(step), rings["outerRadius"] * math.sin(step), 0))
        for step in (2 * math.pi * index / segments for index in range(segments))
    ]
    for index in range(segments):
        following = (index + 1) % segments
        face = built.faces.new((inner[index], outer[index], outer[following], inner[following]))
        for loop in face.loops:
            radial = 0.0 if loop.vert in inner else 1.0
            loop[uv_layer].uv = (radial, 0.5)
    built.to_mesh(mesh)
    built.free()
    ring_object = bpy.data.objects.new(f"{body['id']}-rings", mesh)
    bpy.context.scene.collection.objects.link(ring_object)

    material = bpy.data.materials.new(f"{body['id']}-rings")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Specular IOR Level"].default_value = 0.0
    profile = nodes.new("ShaderNodeTexImage")
    profile.image = verified_image(rings["profileMap"]["path"], rings["profileMap"]["sha256"])
    profile.extension = "EXTEND"
    links.new(profile.outputs["Color"], shader.inputs["Base Color"])
    # The same opacity the 3D scene derives from the Cassini profile:
    # clamp(luminance ^ 0.42 * 1.05, 0, 1).
    luminance = nodes.new("ShaderNodeRGBToBW")
    power = nodes.new("ShaderNodeMath")
    power.operation = "POWER"
    power.inputs[1].default_value = 0.42
    scale = nodes.new("ShaderNodeMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = 1.05
    scale.use_clamp = True
    links.new(profile.outputs["Color"], luminance.inputs["Color"])
    links.new(luminance.outputs["Val"], power.inputs[0])
    links.new(power.outputs["Value"], scale.inputs[0])
    links.new(scale.outputs["Value"], shader.inputs["Alpha"])
    mesh.materials.append(material)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) != 1:
        fail("expected one argument: the job JSON path")
    with open(arguments[0], encoding="utf-8") as job_file:
        job = json.load(job_file)
    for body in job["bodies"]:
        scene = reset_scene(job)
        add_camera_and_light(scene, job, body["frameHalfWidth"], body["width"], body["height"])
        add_globe(body, job["globeTurnDeg"])
        if "rings" in body:
            add_rings(body)
        scene.render.filepath = body["outputPath"]
        bpy.ops.render.render(write_still=True)
        print(f"render-lineup-globes: wrote {body['outputPath']}")


main()
