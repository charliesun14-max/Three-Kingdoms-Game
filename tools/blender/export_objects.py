# Blender (4.x) background script: export named objects from a scene file as separate GLBs,
# optionally decimated, moved to the origin (base centred on 0,0,0).
#   blender -b --factory-startup --python export_objects.py -- scene.fbx out_dir name[:ratio][=outname] ...
import bpy, sys, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
src, out_dir, specs = args[0], args[1], args[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)
os.makedirs(out_dir, exist_ok=True)
for spec in specs:
    name, _, outname = spec.partition('=')
    name, _, ratio = name.partition(':')
    o = bpy.data.objects.get(name)
    if not o: print('MISSING', name); continue
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    c.parent = None; c.matrix_world = o.matrix_world.copy()
    for ob in bpy.context.scene.objects: ob.select_set(ob == c)
    bpy.context.view_layer.objects.active = c
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if ratio:
        m = c.modifiers.new('dec', 'DECIMATE'); m.ratio = float(ratio); m.delimit = {'UV'}
        bpy.ops.object.modifier_apply(modifier='dec')
    # base of the trunk to the origin
    bb = [c.matrix_world @ Vector(v) for v in c.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    c.location -= Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    path = os.path.join(out_dir, (outname or name) + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='NONE')
    print('OUT', outname or name, len(c.data.vertices), tuple(round(v, 2) for v in c.dimensions))
    bpy.data.objects.remove(c, do_unlink=True)
