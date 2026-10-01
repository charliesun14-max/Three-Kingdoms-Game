# Blender (4.x) background script: convert every Megascans asset folder of a pack (one FBX, or VarA_LOD1 for
# plants) to a geometry-only GLB named after the folder, printing triangle counts and real-world sizes.
#   blender -b --factory-startup --python tools/assets/banquet.py -- <pack folder> assets-src/.build/banquet
import bpy, sys, os, glob
from mathutils import Vector
src, out = sys.argv[sys.argv.index('--')+1:][:2]
os.makedirs(out, exist_ok=True)
for d in sorted(os.listdir(src)):
    fb = sorted(glob.glob(f'{src}/{d}/{d}.fbx')) or sorted(glob.glob(f'{src}/{d}/*VarA_LOD1.fbx'))
    if not fb: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fb[0])
    ms=[o for o in bpy.context.scene.objects if o.type=='MESH']
    tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in ms)
    pts=[o.matrix_world@Vector(c) for o in ms for c in o.bound_box]
    mn=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts))); mx=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
    sz=mx-mn
    for o in bpy.context.scene.objects: o.select_set(o.type=='MESH')
    bpy.ops.export_scene.gltf(filepath=f'{out}/{d}.glb', use_selection=True, export_format='GLB', export_materials='EXPORT', export_image_format='NONE')
    print('BQ', d, os.path.basename(fb[0]), tris, '%.2f %.2f %.2f' % (sz.x, sz.y, sz.z), len(ms), flush=True)
