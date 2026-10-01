# Blender (4.x) background script: convert one FBX / OBJ / .blend file to a geometry-only GLB.
#   blender -b --factory-startup --python to_glb.py -- input.(fbx|obj|blend) output.glb
# Textures are attached afterwards by tools/assets/build-assets.mjs (by material name), which is
# more reliable than relying on each exporter's material setup.
import bpy, sys, os

inp, out = sys.argv[sys.argv.index('--') + 1:][:2]
ext = os.path.splitext(inp)[1].lower()
if ext == '.blend':
    bpy.ops.wm.open_mainfile(filepath=inp)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=inp)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=inp)
# drop cameras, lights and UE collision hulls
for o in list(bpy.context.scene.objects):
    if o.type in ('CAMERA', 'LIGHT') or o.name.startswith(('UCX_', 'UBX_', 'USP_')):
        bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.context.scene.objects:
    o.select_set(o.type == 'MESH')
info = [(o.name, len(o.data.vertices), tuple(round(d, 3) for d in o.dimensions), [m.name for m in o.data.materials if m]) for o in bpy.context.scene.objects if o.type == 'MESH']
for i in info:
    print('MESH', *i)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_materials='EXPORT', export_image_format='NONE')
print('DONE', out)
