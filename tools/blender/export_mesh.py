# Blender (4.x) background script: export single meshes (by mesh-data name) from a scene as separate GLBs,
# each moved so its footprint is centred on the origin and its base sits on y = 0.
#   blender -b scene.blend --python export_mesh.py -- out_dir meshName=outName ...
# (import the FBX and save it as .blend once first; huge scene FBX files are slow to re-import)
import bpy, sys
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
out=args[0]
for spec in args[1:]:
    mesh,name=spec.split('=')
    src=next(o for o in bpy.data.objects if o.type=='MESH' and o.data.name==mesh)
    for o in bpy.context.scene.objects: o.select_set(False)
    o=src.copy(); o.data=src.data.copy(); o.parent=None
    tmp=bpy.data.collections.new('tmp'); bpy.context.scene.collection.children.link(tmp); tmp.objects.link(o)
    o.matrix_world=src.matrix_world.copy()
    o.location=(0,0,0)
    bpy.context.view_layer.update()
    bb=[o.matrix_world@Vector(c) for c in o.bound_box]
    cx=sum(v.x for v in bb)/8; cy=sum(v.y for v in bb)/8; mz=min(v.z for v in bb)
    o.location=(-cx,-cy,-mz)
    o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.export_scene.gltf(filepath=f'{out}/{name}.glb', use_selection=True, export_format='GLB')
    bpy.data.objects.remove(o); bpy.data.collections.remove(tmp)
    print('EXPORTED',name, len(src.data.polygons), tuple(round(d,2) for d in src.dimensions))
