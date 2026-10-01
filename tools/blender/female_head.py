# Blender (4.x) background script: cut the head (and neck) out of a Mixamo-rigged character by
# bone weights, keep its eyes and lashes, unpack its textures, and export a static GLB.
#   blender -b --factory-startup --python female_head.py -- costume.fbx out_dir
import bpy, bmesh, sys, os
inp, out_dir = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=inp)
HEAD = {'mixamorig:Head', 'mixamorig:HeadTop_End', 'mixamorig:Neck'}
keep = []
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': continue
    if o.name in ('Eyes', 'Eyelashes'):
        keep.append(o); continue
    if o.name != 'Body':
        bpy.data.objects.remove(o, do_unlink=True); continue
    names = {g.index: g.name for g in o.vertex_groups}
    me = o.data
    headw = [sum(g.weight for g in v.groups if names.get(g.group) in HEAD) for v in me.vertices]
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    kill = [f for f in bm.faces if min(headw[v.index] for v in f.verts) < 0.5]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me); bm.free()
    print('HEAD faces', len(me.polygons))
    keep.append(o)
# bake the armature's rest pose into the meshes and drop the skeleton
for o in keep:
    for m in list(o.modifiers):
        if m.type == 'ARMATURE': o.modifiers.remove(m)
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o.type == 'ARMATURE': bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.context.scene.objects: o.select_set(o in keep)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
os.makedirs(out_dir, exist_ok=True)
for im in bpy.data.images:
    if im.name.startswith('Female_3_Body') and not im.name.endswith('.001'):
        im.filepath_raw = os.path.join(out_dir, im.name if im.name.endswith('.png') else im.name + '.png')
        im.file_format = 'PNG'; im.save()
        print('IMG', im.filepath_raw, im.size[:])
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, 'female_head.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='NONE')
for o in keep: print('PART', o.name, len(o.data.vertices), tuple(round(v, 3) for v in o.dimensions))
