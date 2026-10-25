import { act } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { StructureAssembly } from '../StructureAssembly';
extend({ Group: THREE.Group, Mesh: THREE.Mesh, CylinderGeometry: THREE.CylinderGeometry, LatheGeometry: THREE.LatheGeometry, TorusGeometry: THREE.TorusGeometry, MeshStandardMaterial: THREE.MeshStandardMaterial });
it('mounts mechanical geometry with finite bounds and supports both body layouts', async () => {
 const canvas=document.createElement('canvas');
 const gl={render:vi.fn(),setSize:vi.fn(),setPixelRatio:vi.fn(),domElement:canvas,shadowMap:{},xr:{addEventListener:vi.fn(),removeEventListener:vi.fn(),setAnimationLoop:vi.fn()}};
 const root=createRoot(canvas);
 await root.configure({gl:gl as unknown as THREE.WebGLRenderer,frameloop:'never',size:{width:800,height:600,top:0,left:0}});
 for(const hybrid of [false,true]) {
 let store: ReturnType<typeof root.render>;
 await act(async()=>{store=root.render(<StructureAssembly hybrid={hybrid} accent={()=>'#777777'} onSelect={vi.fn()}/>);});
 const scene=store!.getState().scene;
 expect(scene.children.length).toBeGreaterThan(0);
 scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.computeBoundingBox();expect(Number.isFinite(o.geometry.boundingBox!.max.x)).toBe(true);}});
 }
 await act(async()=>root.unmount());
});
