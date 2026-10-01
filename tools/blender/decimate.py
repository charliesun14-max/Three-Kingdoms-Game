# Blender (4.x) background script: reduce a GLB's triangle count, keeping UV seams and borders.
#   blender -b --factory-startup --python decimate.py -- in.glb out.glb ratio
import bpy, sys
inp, out, ratio = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=inp)
for o in bpy.context.scene.objects:
    if o.type != 'MESH': continue
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = float(ratio); m.use_collapse_triangulate = True
    m.delimit = {'UV', 'SEAM'}
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='dec')
    print('DEC', o.name, len(o.data.polygons))
for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='NONE')
