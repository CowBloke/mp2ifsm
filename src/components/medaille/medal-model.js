import * as THREE from 'three';

function pixels(texture) {
  const c = document.createElement('canvas');
  c.width = texture.image.width; c.height = texture.image.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(texture.image, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height).data, size: c.width };
}

function faceGeometry(height, reverse = false) {
  const { data, size } = pixels(height);
  const rings = reverse ? 48 : 128, segments = 256;
  const positions = [], uvs = [], depths = [], indices = [];
  function add(x, y) {
    const u = (x + 1) / 2, v = (y + 1) / 2;
    const ix = Math.min(size-1, Math.max(0, Math.round(u*(size-1))));
    const iy = Math.min(size-1, Math.max(0, Math.round((1-v)*(size-1))));
    const h = data[(iy*size+ix)*4]/255;
    const depth = reverse ? h*.007 : h*.085;
    positions.push(x, y, .062 + depth); uvs.push(u, v); depths.push(depth);
  }
  add(0,0);
  for (let j=1;j<=rings;j++) for (let i=0;i<=segments;i++) {
    const a=i/segments*Math.PI*2, r=j/rings*.984;
    add(r*Math.cos(a),r*Math.sin(a));
  }
  for(let i=0;i<segments;i++) indices.push(0,1+i,2+i);
  for(let j=0;j<rings-1;j++) for(let i=0;i<segments;i++) {
    const a=1+j*(segments+1)+i, b=a+segments+1;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.setIndex(indices); g.computeVertexNormals();
  // Average duplicate seam normals to prevent a visible radial seam.
  const normals=g.attributes.normal;
  for(let j=0;j<rings;j++) {
    const a=1+j*(segments+1),b=a+segments;
    const n=new THREE.Vector3().fromBufferAttribute(normals,a).add(new THREE.Vector3().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z); normals.setXYZ(b,n.x,n.y,n.z);
  }
  g.userData.depths=depths;
  return g;
}

export async function createMedal(assetBase, { signal } = {}) {
  const loader=new THREE.TextureLoader();
  const files=['medal-color.jpg','medal-height.png','medal-detail.png','medal-roughness.png','medal-back.jpg','medal-back-height.png'];
  const textures=[];
  try {
    await Promise.all(files.map(async (f,i)=>{
      textures[i]=await loader.loadAsync(new URL(f,assetBase).href);
      textures[i].anisotropy=8;
    }));
    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
    const [color,height,detail,roughness,back,backHeight]=textures;
    color.colorSpace=back.colorSpace=THREE.SRGBColorSpace;
    const frontMaterial=new THREE.MeshStandardMaterial({map:color,metalness:.78,roughness:.62,roughnessMap:roughness,bumpMap:detail,bumpScale:.014,envMapIntensity:1.1});
    const backMaterial=new THREE.MeshStandardMaterial({map:back,metalness:.84,roughness:.38,bumpMap:backHeight,bumpScale:.012,envMapIntensity:1.1});
    const edgeMaterial=new THREE.MeshStandardMaterial({color:0xd5a94e,metalness:.94,roughness:.29,envMapIntensity:1.3});
    const medal=new THREE.Group(); medal.name='Pricoupencoin medal';
    const front=new THREE.Mesh(faceGeometry(height),frontMaterial); front.name='Image-derived raised obverse'; medal.add(front);
    const reverse=new THREE.Mesh(faceGeometry(backHeight,true),backMaterial); reverse.name='Designed reverse'; reverse.rotation.y=Math.PI; medal.add(reverse);
    const side=new THREE.Mesh(new THREE.CylinderGeometry(.987,.987,.124,384,1,true),edgeMaterial);
    side.rotation.x=Math.PI/2; side.name='Solid gold edge'; medal.add(side);
    for(const z of [-.062,.062]) {
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.979,.013,12,384),edgeMaterial); rim.position.z=z; rim.name='Rounded lip'; medal.add(rim);
    }
    // One merged mesh for all 240 reeds: low draw-call count, real silhouettes.
    const reedPositions=[],reedNormals=[],reedIndices=[];
    const box=new THREE.BoxGeometry(.012,.017,.106);
    for(let i=0;i<240;i++) {
      const a=i/240*Math.PI*2;
      const copy=box.clone().applyMatrix4(new THREE.Matrix4().makeRotationZ(a)).translate(Math.cos(a)*.987,Math.sin(a)*.987,0);
      const offset=reedPositions.length/3;
      reedPositions.push(...copy.attributes.position.array); reedNormals.push(...copy.attributes.normal.array);
      reedIndices.push(...Array.from(copy.index.array,v=>v+offset)); copy.dispose();
    }
    box.dispose();
    const reeds=new THREE.BufferGeometry(); reeds.setAttribute('position',new THREE.Float32BufferAttribute(reedPositions,3));
    reeds.setAttribute('normal',new THREE.Float32BufferAttribute(reedNormals,3)); reeds.setIndex(reedIndices);
    const reeding=new THREE.Mesh(reeds,edgeMaterial); reeding.name='240 milled edge reeds'; medal.add(reeding);
    medal.userData={source:'Single-image reconstruction; artist-guided estimated relief. Reverse is an original design.',units:'Normalized: diameter 2, body thickness 0.124'};
    return { medal, front, materials:[frontMaterial,backMaterial,edgeMaterial], textures };
  } catch(error) { textures.forEach(t=>t?.dispose()); throw error; }
}
